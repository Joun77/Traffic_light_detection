#!/usr/bin/python
# -*- coding: utf-8 -*-

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
parser.add_argument('--video', type=str, default=None, help='Path to video source')
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
CONFIDENCE        = 0.25 
ROI_CONFIG        = os.path.join(BASE_DIR, '../data/roi_config.json')
STREAM_URL        = 'http://localhost:8000/update-frame'
OUTPUT_BASE       = os.path.join(BASE_DIR, '../outputs')

# Database Config
DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "database": os.getenv("DB_NAME", "traffic_monitoring"),
    "user":     os.getenv("DB_USER", "joun"),
    "password": os.getenv("DB_PASS", "traffic_pass"),
    "port":     os.getenv("DB_PORT", "5432")
}

VEHICLE_CLASSES = {2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'}

# LOAD ROI CONFIG
ROI_Y = None; ROI_X = None; TL_BOX = None; VEH_ZONE = None

if os.path.exists(ROI_CONFIG):
    try:
        with open(ROI_CONFIG) as f:
            cfg = json.load(f)
        ROI_Y  = cfg.get('roi_y')
        ROI_X  = cfg.get('roi_x')
        TL_BOX = cfg.get('traffic_light_box')
        VEH_ZONE = cfg.get('vehicle_zone')
    except: pass

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
        # ⏱️ Increased timeout to 2.0s to ensure DB connection has time to finish
        r = requests.post("http://localhost:8000/violations", json=payload, timeout=2.0)
        print(f"📡 API Response: {r.status_code} - {r.text}")
    except Exception as e:
        print(f"❌ API Log Err: {e}")

def send_light_status_to_api(status):
    try:
        requests.post("http://localhost:8000/set-current-light", json={"status": status}, timeout=0.1)
    except: pass

def send_frame_to_api(frame):
    try:
        # 🏎️ Optimize: Downscale preview to 720p to reduce lag significantly
        h, w = frame.shape[:2]
        if w > 1280:
            scale = 1280 / w
            frame = cv2.resize(frame, (0,0), fx=scale, fy=scale)
        
        _, img_encoded = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        requests.post(STREAM_URL, data=img_encoded.tobytes(), headers={'Content-Type': 'image/jpeg'}, timeout=0.1)
    except: pass

# ============================================================
# MAIN DETECTION
# ============================================================
def run():
    v_model = YOLO(VEHICLE_MODEL)
    t_model = YOLO(TRAFFIC_MODEL)
    
    cap = cv2.VideoCapture(VIDEO_SOURCE)
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = int(cap.get(cv2.CAP_PROP_FPS)) or 30

    print(f"📐 FRAME SIZE: {width}x{height} @ {fps}fps")
    
    # Check if ROI is within frame
    if ROI_Y is not None and ROI_Y >= height:
        print(f"⚠️ Warning: ROI_Y ({ROI_Y}) is outside frame height ({height})")
    if ROI_X is not None and ROI_X >= width:
        print(f"⚠️ Warning: ROI_X ({ROI_X}) is outside frame width ({width})")


    pos_history = {}
    tracked_ids = set()
    violated_ids = set()
    
    current_light = 'unknown'
    last_sent_light = None
    light_history = deque(maxlen=15)
    frames_since_last_light = 0
    MAX_LIGHT_LOST_FRAMES = int(fps * 2.0)

    buffer_frames = deque(maxlen=int(fps * 2)) 
    active_recordings = {}

    # ⏱️ Frame Rate & Processing Control
    prev_frame_time = 0
    STREAM_FPS = 15 # Reduced to 15 for smoother UI response
    frame_interval = 1.0 / STREAM_FPS
    
    frame_count = 0
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        frame_count += 1

        # ⏱️ Control Streaming Frame Rate
        current_time = time.time()
        if (current_time - prev_frame_time) < frame_interval:
            continue
        prev_frame_time = current_time

        display_frame = frame.copy()
        buffer_frames.append(frame.copy())

        # 1. Traffic Light Detection (Every 2 frames to save CPU)
        detected_this_frame = 'unknown'
        if TL_BOX is not None and frame_count % 2 == 0:
            tx1, ty1, tx2, ty2 = map(int, TL_BOX)
            pad = 40
            cx1, cy1 = max(0, tx1-pad), max(0, ty1-pad)
            cx2, cy2 = min(width, tx2+pad), min(height, ty2+pad)
            tl_crop = frame[cy1:cy2, cx1:cx2]
            if tl_crop.size > 0:
                t_results = t_model(tl_crop, conf=0.25, verbose=False)[0]
                if len(t_results.boxes) > 0:
                    best_box = t_results.boxes[0]
                    detected_this_frame = t_model.names[int(best_box.cls[0])]
                    b = best_box.xyxy[0].cpu().numpy()
                    cv2.rectangle(display_frame, (int(b[0]+cx1), int(b[1]+cy1)), (int(b[2]+cx1), int(b[3]+cy1)), (255, 255, 255), 2)
        
            if detected_this_frame != 'unknown':
                light_history.append(detected_this_frame)
                frames_since_last_light = 0
            else:
                frames_since_last_light += 1

            if len(light_history) > 0:
                current_light = max(set(light_history), key=list(light_history).count)
            
            if frames_since_last_light > MAX_LIGHT_LOST_FRAMES:
                current_light = 'unknown'

            if current_light != last_sent_light:
                send_light_status_to_api(current_light)
                last_sent_light = current_light

        lc = (0,0,255) if current_light == 'red' else (0,255,0) if current_light == 'green' else (128,128,128)
        cv2.putText(display_frame, f"LIGHT: {current_light.upper()}", (width - 400, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.5, lc, 4)

        # 2. Vehicle Detection
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
                    x1, y1, x2, y2 = map(int, box)
                    x1 += vx1; x2 += vx1; y1 += vy1; y2 += vy1
                    v_type = VEHICLE_CLASSES[cls]
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    
                    is_violating = False
                    if track_id in pos_history:
                        px, py = pos_history[track_id]
                        # 📈 Line Crossing Buffer
                        if ROI_Y is not None:
                            if py > ROI_Y and cy <= (ROI_Y + 15): # Entering from bottom
                                if current_light == 'red': is_violating = True
                            if py > ROI_Y + 10 and cy < ROI_Y - 10: # Sharp cross
                                if current_light == 'red': is_violating = True
                        if ROI_X is not None:
                            if px > ROI_X and cx <= (ROI_X + 15): # Entering from right
                                if current_light == 'red': is_violating = True
                            if px > ROI_X + 10 and cx < ROI_X - 10: # Sharp cross
                                if current_light == 'red': is_violating = True

                    pos_history[track_id] = (cx, cy)

                    if is_violating and track_id not in violated_ids:
                        violated_ids.add(track_id)
                        ts = time.strftime('%Y%m%d_%H%M%S')
                        ms = int(time.time() * 1000) % 1000
                        rel_img = f"evidences/images/v_{track_id}_{ts}_{ms}.jpg"
                        rel_vid = f"evidences/videos/v_{track_id}_{ts}_{ms}.mp4"
                        abs_img = os.path.join(OUTPUT_BASE, rel_img)
                        abs_vid = os.path.join(OUTPUT_BASE, rel_vid)
                        
                        os.makedirs(os.path.dirname(abs_img), exist_ok=True)
                        os.makedirs(os.path.dirname(abs_vid), exist_ok=True)

                        proof = frame.copy()
                        cv2.rectangle(proof, (x1, y1), (x2, y2), (0, 0, 255), 4)
                        cv2.putText(proof, f"VIO ID:{track_id} ({v_type.upper()})", (x1, y1-15), 1, 1.5, (0,0,255), 3)
                        if TL_BOX:
                            tx1, ty1, tx2, ty2 = map(int, TL_BOX)
                            cv2.rectangle(proof, (tx1, ty1), (tx2, ty2), (255, 255, 255), 2)
                        cv2.imwrite(abs_img, proof)
                        
                        out_v = cv2.VideoWriter(abs_vid, cv2.VideoWriter_fourcc(*'mp4v'), fps, (width, height))
                        for bf in buffer_frames: out_v.write(bf)
                        active_recordings[track_id] = [out_v, 0, rel_vid, v_type, rel_img]

                    color = (0, 0, 255) if track_id in violated_ids else (0, 255, 0)
                    cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)

        for vid_id in list(active_recordings.keys()):
            w, fc, vp, vt, ip = active_recordings[vid_id]
            w.write(frame); active_recordings[vid_id][1] += 1
            if active_recordings[vid_id][1] > int(fps * 3):
                w.release(); log_violation_to_api(vid_id, vt, "RED", ip, vp); del active_recordings[vid_id]

        if ROI_Y is not None: cv2.line(display_frame, (0, ROI_Y), (width, ROI_Y), (0, 255, 0), 2)
        if ROI_X is not None: cv2.line(display_frame, (ROI_X, 0), (ROI_X, height), (0, 255, 255), 2)
        if TL_BOX is not None: cv2.rectangle(display_frame, (TL_BOX[0], TL_BOX[1]), (TL_BOX[2], TL_BOX[3]), (255, 0, 0), 2)

        send_frame_to_api(display_frame)

    cap.release()


if __name__ == '__main__':
    run()
