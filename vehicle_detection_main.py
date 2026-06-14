#!/usr/bin/python
# -*- coding: utf-8 -*-
# vehicle_detection_main.py (Web-Only Version: No Pop-up Windows)

import cv2
import numpy as np
import csv
import time
import os
import json
import argparse
import psycopg2
import requests
from collections import deque
from ultralytics import YOLO

# ============================================================
# CONFIG
# ============================================================
VIDEO_SOURCE      = 'IMG_9582.MOV'
VEHICLE_MODEL     = 'yolo26s.pt'
TRAFFIC_MODEL     = 'traffic_light_results/weights/best.pt'
CONFIDENCE        = 0.35
ROI_CONFIG        = 'roi_config.json'
STREAM_URL        = 'http://localhost:8000/update-frame'

# Database Config
DB_CONFIG = {
    "host": "localhost",
    "database": "traffic_monitoring",
    "user": "joun",
    "password": "traffic_pass",
    "port": "5432"
}

VEHICLE_CLASSES = {2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'}

# LOAD ROI CONFIG
ROI_Y = None; ROI_X = None; TL_BOX = None; VEH_ZONE = None
if os.path.exists(ROI_CONFIG):
    with open(ROI_CONFIG) as f:
        cfg = json.load(f)
    ROI_Y  = cfg.get('roi_y')
    ROI_X  = cfg.get('roi_x')
    TL_BOX = cfg.get('traffic_light_box')
    VEH_ZONE = cfg.get('vehicle_zone')

# ============================================================
# HELPERS
# ============================================================
def log_violation_to_api(v_id, v_type, light, img_path, vid_path):
    try:
        # ส่งข้อมูลไปที่ API แทนการเขียน DB โดยตรง เพื่อให้ API แจ้งเตือนหน้าเว็บได้ทันที
        payload = {
            "vehicle_id": int(v_id),
            "vehicle_type": v_type,
            "light_status": light,
            "image_path": img_path,
            "video_path": vid_path
        }
        requests.post("http://localhost:8000/violations", json=payload, timeout=0.5)
    except Exception as e: print(f"❌ API Logging Error: {e}")

def is_inside(box, area):
    if area is None: return True
    bx1, by1, bx2, by2 = box
    cx, cy = (bx1 + bx2) // 2, (by1 + by2) // 2
    ax1, ay1, ax2, ay2 = area
    return (ax1 <= cx <= ax2) and (ay1 <= cy <= ay2)

def send_frame_to_api(frame):
    """ส่งเฟรมไปที่ FastAPI (โดยไม่เปิดหน้าต่างใหม่)"""
    try:
        _, img_encoded = cv2.imencode('.jpg', frame)
        # ใช้ timeout สั้นๆ เพื่อไม่ให้หน่วง AI
        requests.post(STREAM_URL, data=img_encoded.tobytes(), headers={'Content-Type': 'image/jpeg'}, timeout=0.03)
    except: pass

# ============================================================
# MAIN DETECTION
# ============================================================
def run():
    print("[YOLO] Starting Web-Stream Mode (No Local Windows)...")
    v_model = YOLO(VEHICLE_MODEL)
    t_model = YOLO(TRAFFIC_MODEL)
    
    cap = cv2.VideoCapture(VIDEO_SOURCE)
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = int(cap.get(cv2.CAP_PROP_FPS)) or 30

    pos_history = {}
    tracked_y = set(); tracked_down = set(); tracked_x = set()
    violated_ids = set()
    
    cnt_forward = 0; cnt_downward = 0; cnt_left = 0; violations = 0
    current_light = 'unknown'

    buffer_frames = deque(maxlen=int(fps * 2)) 
    active_recordings = {}

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        
        display_frame = frame.copy()
        buffer_frames.append(frame.copy())

        # 1. Traffic Light
        t_results = t_model(frame, conf=0.4, verbose=False)[0]
        if len(t_results.boxes) > 0:
            for box in t_results.boxes:
                b = list(map(int, box.xyxy[0]))
                if is_inside(b, TL_BOX):
                    current_light = t_model.names[int(box.cls[0])]
                    cv2.rectangle(display_frame, (b[0], b[1]), (b[2], b[3]), (255, 255, 255), 2)
                    break

        # 2. Vehicle Detection & Tracking
        v_results = v_model.track(frame, persist=True, conf=CONFIDENCE, verbose=False)[0]
        if v_results.boxes.id is not None:
            boxes = v_results.boxes.xyxy.cpu().numpy()
            ids = v_results.boxes.id.cpu().numpy().astype(int)
            clss = v_results.boxes.cls.cpu().numpy().astype(int)

            for box, track_id, cls in zip(boxes, ids, clss):
                if cls not in VEHICLE_CLASSES: continue
                if not is_inside(list(map(int, box)), VEH_ZONE): continue
                
                x1, y1, x2, y2 = map(int, box)
                v_type = VEHICLE_CLASSES[cls]
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                
                direction = "Static"
                if track_id in pos_history:
                    prev_cx, prev_cy = pos_history[track_id]
                    dy, dx = cy - prev_cy, cx - prev_cx
                    if abs(dy) > abs(dx): direction = "Down" if dy > 0 else "Up"
                    else: direction = "Right" if dx > 0 else "Left"
                pos_history[track_id] = (cx, cy)

                is_violating = False
                if ROI_Y and y1 < ROI_Y < y2 and direction == "Up":
                    if track_id not in tracked_y:
                        tracked_y.add(track_id); cnt_forward += 1
                        if current_light == 'red': is_violating = True
                elif ROI_Y and y1 < ROI_Y < y2 and direction == "Down":
                    if track_id not in tracked_down: tracked_down.add(track_id); cnt_downward += 1
                if ROI_X and x1 < ROI_X < x2 and direction == "Left":
                    if track_id not in tracked_x:
                        tracked_x.add(track_id); cnt_left += 1
                        if current_light == 'red': is_violating = True

                if is_violating and track_id not in violated_ids:
                    violations += 1; violated_ids.add(track_id)
                    ts = time.strftime('%Y%m%d_%H%M%S')
                    ms = int(time.time() * 1000) % 1000
                    img_p = f"evidences/images/v_{track_id}_{ts}_{ms}.jpg"
                    vid_p = f"evidences/videos/v_{track_id}_{ts}_{ms}.mp4"
                    cv2.imwrite(img_p, frame)
                    
                    out_vid = cv2.VideoWriter(vid_p, cv2.VideoWriter_fourcc(*'mp4v'), fps, (width, height))
                    for bf in buffer_frames: out_vid.write(bf)
                    active_recordings[track_id] = [out_vid, 0, vid_p, v_type, img_p]

                color = (0, 0, 255) if track_id in violated_ids else (0, 255, 0)
                cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(display_frame, f"ID:{track_id}", (x1, y1-5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        # Handle Recordings
        for vid_id in list(active_recordings.keys()):
            w, f_c, vp, vt, ip = active_recordings[vid_id]
            w.write(frame); active_recordings[vid_id][1] += 1
            if active_recordings[vid_id][1] > int(fps * 3):
                w.release(); log_violation_to_db(vid_id, vt, "RED", ip, vp); del active_recordings[vid_id]

        # Draw GUI elements
        if ROI_Y: cv2.line(display_frame, (0, ROI_Y), (width, ROI_Y), (0, 255, 0), 2)
        if ROI_X: cv2.line(display_frame, (ROI_X, 0), (ROI_X, height), (255, 255, 0), 2)
        if VEH_ZONE: cv2.rectangle(display_frame, (VEH_ZONE[0], VEH_ZONE[1]), (VEH_ZONE[2], VEH_ZONE[3]), (0, 255, 255), 1)
        
        lc = (0,0,255) if current_light=='red' else (0,255,0) if current_light=='green' else (128,128,128)
        cv2.circle(display_frame, (width - 40, 40), 15, lc, -1)
        cv2.putText(display_frame, f"VIO:{violations}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,0,255), 2)

        # 🚀 ส่งไปที่ Web เท่านั้น (ห้ามใช้ cv2.imshow)
        send_frame_to_api(display_frame)

    cap.release()

if __name__ == '__main__':
    run()
