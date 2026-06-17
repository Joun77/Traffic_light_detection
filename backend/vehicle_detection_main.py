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
parser.add_argument('--camera_db_id', type=int, default=None, help='Database ID of the camera')
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

print(f"🚀 AI SESSION START: CAM_ID={args.camera_db_id}, Y={ROI_Y}, X={ROI_X}")

# ============================================================
# HELPERS
# ============================================================
def log_violation_to_api(v_id, v_type, light, img_path, vid_path, cam_id):
    try:
        payload = {
            "vehicle_id": int(v_id),
            "vehicle_type": v_type,
            "light_status": light,
            "image_path": img_path,
            "video_path": vid_path,
            "camera_id": cam_id
        }
        r = requests.post("http://localhost:8000/violations", json=payload, timeout=2.0)
        print(f"📡 API Response: {r.status_code}")
    except Exception as e:
        print(f"❌ API Log Err: {e}")

def send_light_status_to_api(status):
    try:
        requests.post("http://localhost:8000/set-current-light", json={"status": status}, timeout=0.1)
    except: pass

def send_frame_to_api(frame):
    try:
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

    pos_history = {}
    violated_ids = set()
    current_light = 'unknown'
    last_sent_light = None
    light_history = deque(maxlen=15)
    frames_since_last_light = 0
    MAX_LIGHT_LOST_FRAMES = int(fps * 2.0)
    buffer_frames = deque(maxlen=int(fps * 2)) 
    active_recordings = {}

    prev_frame_time = 0
    STREAM_FPS = 15 
    frame_interval = 1.0 / STREAM_FPS
    frame_count = 0
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        frame_count += 1
        current_time = time.time()
        if (current_time - prev_frame_time) < frame_interval: continue
        prev_frame_time = current_time

        display_frame = frame.copy()
        buffer_frames.append(frame.copy())

        # 1. Traffic Light Detection
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
                light_history.append(detected_this_frame); frames_since_last_light = 0
            else: frames_since_last_light += 1

            if len(light_history) > 0: current_light = max(set(light_history), key=list(light_history).count)
            if frames_since_last_light > MAX_LIGHT_LOST_FRAMES: current_light = 'unknown'
            if current_light != last_sent_light:
                send_light_status_to_api(current_light); last_sent_light = current_light

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
                        if ROI_Y is not None:
                            if py > ROI_Y and cy <= (ROI_Y + 15) and current_light == 'red': is_violating = True
                        if ROI_X is not None:
                            if px > ROI_X and cx <= (ROI_X + 15) and current_light == 'red': is_violating = True
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

                        # 🔍 SMART CROP FOR EVIDENCE
                        ex1, ey1, ex2, ey2 = x1, y1, x2, y2
                        if TL_BOX:
                            tx1, ty1, tx2, ty2 = map(int, TL_BOX)
                            ex1, ey1 = min(ex1, tx1), min(ey1, ty1)
                            ex2, ey2 = max(ex2, tx2), max(ey2, ty2)
                        pad = 150
                        ex1, ey1 = max(0, ex1-pad), max(0, ey1-pad)
                        ex2, ey2 = min(width, ex2+pad), min(height, ey2+pad)
                        
                        proof_crop = frame[ey1:ey2, ex1:ex2]
                        if proof_crop.size > 0:
                            p_draw = proof_crop.copy()
                            cv2.rectangle(p_draw, (x1-ex1, y1-ey1), (x2-ex1, y2-ey1), (0, 0, 255), 4)
                            cv2.putText(p_draw, f"VIO ID:{track_id} ({v_type.upper()})", (x1-ex1, y1-ey1-15), 1, 1.5, (0,0,255), 3)
                            if TL_BOX:
                                tx1, ty1, tx2, ty2 = map(int, TL_BOX)
                                cv2.rectangle(p_draw, (tx1-ex1, ty1-ey1), (tx2-ex1, ty2-ey1), (255, 255, 255), 3)
                                cv2.putText(p_draw, "SIGNAL", (tx1-ex1, ty1-ey1-10), 1, 1.2, (255,255,255), 2)
                            cv2.imwrite(abs_img, p_draw)
                        else: cv2.imwrite(abs_img, frame)

                        crop_w, crop_h = (ex2-ex1)//2*2, (ey2-ey1)//2*2
                        fourcc = cv2.VideoWriter_fourcc(*'avc1') 
                        out_v = cv2.VideoWriter(abs_vid, fourcc, fps, (crop_w, crop_h))
                        for bf in buffer_frames:
                            b_c = bf[ey1:ey1+crop_h, ex1:ex1+crop_w]
                            if b_c.shape[:2] == (crop_h, crop_w): out_v.write(b_c)
                                
                        active_recordings[track_id] = {"writer": out_v, "count": 0, "rel_vid": rel_vid, "v_type": v_type, "rel_img": rel_img, "crop": (ex1, ey1, crop_w, crop_h)}

                    color = (0, 0, 255) if track_id in violated_ids else (0, 255, 0)
                    cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)

        for vid_id in list(active_recordings.keys()):
            rec = active_recordings[vid_id]; ex1, ey1, cw, ch = rec["crop"]
            f_c = frame[ey1:ey1+ch, ex1:ex1+cw]
            if f_c.shape[:2] == (ch, cw): rec["writer"].write(f_c)
            rec["count"] += 1
            if rec["count"] > int(fps * 3):
                rec["writer"].release()
                log_violation_to_api(vid_id, rec["v_type"], "RED", rec["rel_img"], rec["rel_vid"], args.camera_db_id)
                del active_recordings[vid_id]

        if ROI_Y is not None: cv2.line(display_frame, (0, ROI_Y), (width, ROI_Y), (0, 255, 0), 2)
        if ROI_X is not None: cv2.line(display_frame, (ROI_X, 0), (ROI_X, height), (0, 255, 255), 2)
        if TL_BOX is not None:
            cv2.rectangle(display_frame, (TL_BOX[0], TL_BOX[1]), (TL_BOX[2], TL_BOX[3]), (255, 0, 0), 2)
        if VEH_ZONE is not None:
            cv2.rectangle(display_frame, (VEH_ZONE[0], VEH_ZONE[1]), (VEH_ZONE[2], VEH_ZONE[3]), (200, 200, 200), 1)
        send_frame_to_api(display_frame)

    cap.release()

if __name__ == '__main__':
    run()
