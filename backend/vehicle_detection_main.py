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
# ARGUMENTS
# ============================================================
parser = argparse.ArgumentParser()
parser.add_argument('--video', type=str, default='IMG_9582.MOV', help='Path to video source')
parser.add_argument('--roi_y', type=int, default=None)
parser.add_argument('--roi_x', type=int, default=None)
parser.add_argument('--tl_box', type=str, default=None, help='Format: x1,y1,x2,y2')
parser.add_argument('--veh_zone', type=str, default=None, help='Format: x1,y1,x2,y2')
args = parser.parse_args()

# ============================================================
# CONFIG
# ============================================================
BASE_DIR          = os.path.dirname(os.path.abspath(__file__))
VIDEO_SOURCE      = args.video
VEHICLE_MODEL     = os.path.join(BASE_DIR, '../models/yolo26s.pt')
TRAFFIC_MODEL     = os.path.join(BASE_DIR, '../models/traffic_light_results/weights/best.pt')
CONFIDENCE        = 0.30 # Slightly lower for better recall on small bikes
ROI_CONFIG        = os.path.join(BASE_DIR, '../data/roi_config.json')
STREAM_URL        = 'http://localhost:8000/update-frame'
OUTPUT_BASE       = os.path.join(BASE_DIR, '../outputs')

# Database Config
DB_CONFIG = {
    "host": "localhost",
    "database": "traffic_monitoring",
    "user": "joun",
    "password": "traffic_pass",
    "port": "5432"
}

VEHICLE_CLASSES = {2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'}

# LOAD ROI CONFIG (Active Logic)
ROI_Y = None; ROI_X = None; TL_BOX = None; VEH_ZONE = None

# 1. Load from file first (Default)
if os.path.exists(ROI_CONFIG):
    try:
        with open(ROI_CONFIG) as f:
            cfg = json.load(f)
        ROI_Y  = cfg.get('roi_y')
        ROI_X  = cfg.get('roi_x')
        TL_BOX = cfg.get('traffic_light_box')
        VEH_ZONE = cfg.get('vehicle_zone')
    except: pass

# 2. Override with CLI Arguments (Session-specific)
if args.roi_y is not None: ROI_Y = args.roi_y
if args.roi_x is not None: ROI_X = args.roi_x
if args.tl_box: 
    try: TL_BOX = [int(v) for v in args.tl_box.split(',')]
    except: pass
if args.veh_zone: 
    try: VEH_ZONE = [int(v) for v in args.veh_zone.split(',')]
    except: pass

print(f"🚀 AI SESSION START: Y={ROI_Y}, X={ROI_X}, TL={TL_BOX}, ZONE={VEH_ZONE}")

# ============================================================
# HELPERS
# ============================================================
def log_violation_to_api(v_id, v_type, light, img_path, vid_path):
    try:
        payload = {
            "vehicle_id": int(v_id),
            "vehicle_type": v_type,
            "light_status": light,
            "image_path": img_path,
            "video_path": vid_path
        }
        requests.post("http://localhost:8000/violations", json=payload, timeout=0.5)
    except Exception as e: print(f"❌ API Violation Log Error: {e}")

def send_light_status_to_api(status):
    try:
        resp = requests.post("http://localhost:8000/set-current-light", json={"status": status}, timeout=0.05)
    except: pass

def is_inside(box, area):
    if area is None: return True
    bx1, by1, bx2, by2 = box
    cx, cy = (bx1 + bx2) // 2, (by1 + by2) // 2
    ax1, ay1, ax2, ay2 = area
    return (ax1 <= cx <= ax2) and (ay1 <= cy <= ay2)

def send_frame_to_api(frame):
    try:
        _, img_encoded = cv2.imencode('.jpg', frame)
        requests.post(STREAM_URL, data=img_encoded.tobytes(), headers={'Content-Type': 'image/jpeg'}, timeout=0.03)
    except: pass

# ============================================================
# MAIN DETECTION
# ============================================================
def run():
    print(f"[YOLO] Starting Web-Stream Mode using video: {VIDEO_SOURCE}")
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
    last_sent_light = None
    light_history = deque(maxlen=15)
    frames_since_last_light = 0
    MAX_LIGHT_LOST_FRAMES = int(fps * 2.0)

    buffer_frames = deque(maxlen=int(fps * 2)) 
    active_recordings = {}
    frame = None 
    
    while cap.isOpened():
        if current_light == 'unknown' or frames_since_last_light > MAX_LIGHT_LOST_FRAMES:
            if frame is None:
                ret, frame = cap.read()
                if not ret: break
        else:
            ret, next_frame = cap.read()
            if not ret: break
            frame = next_frame

        display_frame = frame.copy()
        buffer_frames.append(frame.copy())

        # 1. Traffic Light Detection (ZOOM-IN)
        detected_this_frame = 'unknown'
        if TL_BOX is not None:
            tx1, ty1, tx2, ty2 = map(int, TL_BOX)
            pad = 50
            cx1, cy1 = max(0, tx1-pad), max(0, ty1-pad)
            cx2, cy2 = min(width, tx2+pad), min(height, ty2+pad)
            tl_crop = frame[cy1:cy2, cx1:cx2]
            if tl_crop.size > 0:
                t_results = t_model(tl_crop, conf=0.25, verbose=False)[0]
                if len(t_results.boxes) > 0:
                    best_box = t_results.boxes[0]
                    detected_this_frame = t_model.names[int(best_box.cls[0])]
                    b = best_box.xyxy[0].cpu().numpy()
                    cv2.rectangle(display_frame, (int(b[0]+cx1), int(b[1]+cy1)), (int(b[2]+cx1), int(b[3]+cy1)), (255, 255, 255), 3)
        
        if detected_this_frame != 'unknown':
            light_history.append(detected_this_frame)
            frames_since_last_light = 0
        else:
            frames_since_last_light += 1

        valid_hits = [s for s in light_history if s != 'unknown']
        if valid_hits:
            current_light = max(set(valid_hits), key=valid_hits.count)
        else:
            current_light = 'unknown'
            
        if current_light != last_sent_light:
            send_light_status_to_api(current_light)
            last_sent_light = current_light

        if current_light == 'unknown':
            cv2.putText(display_frame, "SEARCHING FOR TRAFFIC LIGHT...", (width//2 - 350, height//2), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 165, 255), 4)
            send_frame_to_api(display_frame)
            continue

        # 2. Vehicle Detection (ZONE-BASED ZOOM)
        # We crop the frame to VEH_ZONE and run detection on the crop to find small objects
        vx1, vy1, vx2, vy2 = map(int, VEH_ZONE) if VEH_ZONE else (0, 0, width, height)
        veh_crop = frame[vy1:vy2, vx1:vx2]
        
        if veh_crop.size > 0:
            v_results = v_model.track(veh_crop, persist=True, conf=CONFIDENCE, verbose=False)[0]
            if v_results.boxes.id is not None:
                boxes = v_results.boxes.xyxy.cpu().numpy()
                ids = v_results.boxes.id.cpu().numpy().astype(int)
                clss = v_results.boxes.cls.cpu().numpy().astype(int)

                for box, track_id, cls in zip(boxes, ids, clss):
                    if cls not in VEHICLE_CLASSES: continue
                    
                    # Map coordinates back to original frame
                    x1, y1, x2, y2 = map(int, box)
                    x1 += vx1; x2 += vx1; y1 += vy1; y2 += vy1
                    
                    v_type = VEHICLE_CLASSES[cls]
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    
                    # 🚦 ROBUST CROSSING DETECTION 🚦
                    is_violating = False
                    if track_id in pos_history:
                        prev_cx, prev_cy = pos_history[track_id]
                        
                        # 1. แนวนอน (ROI_Y) - ตรวจการข้ามเส้นจากล่างขึ้นบน (Up)
                        if ROI_Y is not None:
                            # ตรวจว่าเฟรมก่อนอยู่ใต้เส้น และเฟรมนี้อยู่เหนือเส้น (หรือทับเส้นพอดี)
                            # เพิ่มบัฟเฟอร์ 15 พิกเซลเพื่อป้องกันการข้ามเฟรมสำหรับรถเร็ว
                            if prev_cy > ROI_Y and cy <= (ROI_Y + 15):
                                if track_id not in tracked_y:
                                    tracked_y.add(track_id); cnt_forward += 1
                                    if current_light == 'red': is_violating = True

                            # ตรวจการวิ่งย้อนกลับ (Down)
                            elif prev_cy < ROI_Y and cy >= (ROI_Y - 15):
                                if track_id not in tracked_down:
                                    tracked_down.add(track_id); cnt_downward += 1

                        # 2. แนวตั้ง (ROI_X) - ตรวจการข้ามจากขวาไปซ้าย (Left)
                        if ROI_X is not None:
                            if prev_cx > ROI_X and cx <= (ROI_X + 15):
                                if track_id not in tracked_x:
                                    tracked_x.add(track_id); cnt_left += 1
                                    if current_light == 'red': is_violating = True

                    pos_history[track_id] = (cx, cy)

                    if is_violating and track_id not in violated_ids:
                        violations += 1; violated_ids.add(track_id)
                        ts = time.strftime('%Y%m%d_%H%M%S')
                        ms = int(time.time() * 1000) % 1000
                        img_p = f"evidences/images/v_{track_id}_{ts}_{ms}.jpg"
                        vid_p = f"evidences/videos/v_{track_id}_{ts}_{ms}.mp4"
                        
                        # 📸 CREATE VISUAL PROOF FOR IMAGE EVIDENCE
                        proof_frame = frame.copy()
                        # 1. วาดกรอบสีแดงหนาๆ รอบรถที่ทำผิด
                        cv2.rectangle(proof_frame, (x1, y1), (x2, y2), (0, 0, 255), 5)
                        cv2.putText(proof_frame, f"VIOLATION ID:{track_id} ({v_type.upper()})", (x1, y1-20), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 4)
                        
                        # 2. วาดกรอบรอบไฟจราจรในขณะนั้น
                        if TL_BOX:
                            tx1, ty1, tx2, ty2 = map(int, TL_BOX)
                            cv2.rectangle(proof_frame, (tx1, ty1), (tx2, ty2), (255, 255, 255), 3)
                            cv2.putText(proof_frame, f"LIGHT STATUS: RED", (tx1, ty1-15), 
                                        cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)

                        # บันทึกภาพที่มีการขีดฆ่าเป็นหลักฐาน
                        cv2.imwrite(img_p, proof_frame)
                        
                        out_vid = cv2.VideoWriter(vid_p, cv2.VideoWriter_fourcc(*'mp4v'), fps, (width, height))
                        for bf in buffer_frames: out_vid.write(bf)
                        active_recordings[track_id] = [out_vid, 0, vid_p, v_type, img_p]

                    color = (0, 0, 255) if track_id in violated_ids else (0, 255, 0)
                    cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(display_frame, f"{v_type} ID:{track_id}", (x1, y1-5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        # Handle Recordings
        for vid_id in list(active_recordings.keys()):
            w, f_c, vp, vt, ip = active_recordings[vid_id]
            w.write(frame); active_recordings[vid_id][1] += 1
            if active_recordings[vid_id][1] > int(fps * 3):
                w.release(); log_violation_to_api(vid_id, vt, "RED", ip, vp); del active_recordings[vid_id]

        # --- 🎨 Draw GUI (Always drawn in every frame) ---
        if ROI_Y is not None: 
            cv2.line(display_frame, (0, int(ROI_Y)), (width, int(ROI_Y)), (0, 255, 0), 3)
            cv2.putText(display_frame, "ROI Y", (10, int(ROI_Y)-10), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        if ROI_X is not None: 
            cv2.line(display_frame, (int(ROI_X), 0), (int(ROI_X), height), (255, 255, 0), 3)
            cv2.putText(display_frame, "ROI X", (int(ROI_X)+10, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 0), 2)
        if TL_BOX is not None:
            cv2.rectangle(display_frame, (int(TL_BOX[0]), int(TL_BOX[1])), (int(TL_BOX[2]), int(TL_BOX[3])), (0, 0, 255), 3)
            cv2.putText(display_frame, "LIGHT ZONE", (int(TL_BOX[0]), int(TL_BOX[1])-10), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        if VEH_ZONE is not None: 
            cv2.rectangle(display_frame, (int(VEH_ZONE[0]), int(VEH_ZONE[1])), (int(VEH_ZONE[2]), int(VEH_ZONE[3])), (255, 255, 255), 1)
            cv2.putText(display_frame, "VEHICLE ZONE", (int(VEH_ZONE[0])+5, int(VEH_ZONE[1])+25), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 1)
        
        # Indicator light circle
        lc = (0,0,255) if current_light=='red' else (0,255,0) if current_light=='green' else (128,128,128)
        cv2.circle(display_frame, (width - 80, 80), 30, lc, -1)
        cv2.putText(display_frame, f"VIO:{violations}", (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0,0,255), 3)

        send_frame_to_api(display_frame)

    cap.release()

if __name__ == '__main__':
    run()
