#!/usr/bin/python
# -*- coding: utf-8 -*-
# vehicle_detection_main.py (Full Thesis Version: Database + Evidence Capture)

import cv2
import numpy as np
import csv
import time
import os
import json
import argparse
import psycopg2
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
    print(f"[CONFIG] All ROI Settings Loaded Successfully")

# ============================================================
# DATABASE & EVIDENCE HELPERS
# ============================================================
def log_violation_to_db(v_id, v_type, light, img_path, vid_path):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        # แปลง v_id เป็น int (Python native) เพื่อป้องกัน Error กับ numpy.int64
        cur.execute("""
            INSERT INTO violations (vehicle_id, vehicle_type, light_status, image_path, video_path)
            VALUES (%s, %s, %s, %s, %s)
        """, (int(v_id), v_type, light, img_path, vid_path))
        conn.commit()
        cur.close()
        conn.close()
        print(f"📁 Logged violation ID:{v_id} to Database")
    except Exception as e:
        print(f"❌ DB Error: {e}")

def is_inside(box, area):
    if area is None: return True
    bx1, by1, bx2, by2 = box
    cx, cy = (bx1 + bx2) // 2, (by1 + by2) // 2
    ax1, ay1, ax2, ay2 = area
    return (ax1 <= cx <= ax2) and (ay1 <= cy <= ay2)

# ============================================================
# MAIN DETECTION
# ============================================================
def run():
    print("[YOLO] Loading Models...")
    v_model = YOLO(VEHICLE_MODEL)
    t_model = YOLO(TRAFFIC_MODEL)
    
    cap = cv2.VideoCapture(VIDEO_SOURCE)
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = int(cap.get(cv2.CAP_PROP_FPS)) or 30

    # Ensure evidence directories exist
    os.makedirs("evidences/images", exist_ok=True)
    os.makedirs("evidences/videos", exist_ok=True)

    # State Variables
    pos_history = {}
    tracked_y = set(); tracked_down = set(); tracked_x = set()
    violated_ids = set()
    
    cnt_forward = 0; cnt_downward = 0; cnt_left = 0; violations = 0
    current_light = 'unknown'

    # --- 🎥 Video Buffer for Evidence (Stores 2 seconds of pre-incident footage) ---
    buffer_frames = deque(maxlen=int(fps * 2)) 
    active_recordings = {} # {track_id: [VideoWriter, frame_count, vid_path, type, img_path]}

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        
        display_frame = frame.copy()
        buffer_frames.append(frame.copy())

        # 1. ตรวจจับไฟจราจร
        t_results = t_model(frame, conf=0.4, verbose=False)[0]
        if len(t_results.boxes) > 0:
            for box in t_results.boxes:
                b = list(map(int, box.xyxy[0]))
                if is_inside(b, TL_BOX):
                    current_light = t_model.names[int(box.cls[0])]
                    # วาดกรอบรอบไฟที่ตรวจเจอจริงในพื้นที่ MONITOR
                    cv2.rectangle(display_frame, (b[0], b[1]), (b[2], b[3]), (255, 255, 255), 2)
                    break

        # 2. ตรวจจับและติดตามรถ
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
                
                # ตรวจจับทิศทาง
                direction = "Static"
                if track_id in pos_history:
                    prev_cx, prev_cy = pos_history[track_id]
                    dy, dx = cy - prev_cy, cx - prev_cx
                    if abs(dy) > abs(dx): direction = "Down" if dy > 0 else "Up"
                    else: direction = "Right" if dx > 0 else "Left"
                pos_history[track_id] = (cx, cy)

                # แปลงคำว่า Up เป็น Forward เพื่อความเข้าใจง่ายในโค้ดนับ
                display_dir = "Forward" if direction == "Up" else direction

                # --- ⚠️ การนับและตรวจจับการฝ่าฝืน ---
                is_violating_now = False
                
                # A. ตรวจเส้นนอน (Y) - วิ่งขึ้น (Up)
                if ROI_Y and y1 < ROI_Y < y2 and direction == "Up":
                    if track_id not in tracked_y:
                        tracked_y.add(track_id); cnt_forward += 1
                        if current_light == 'red': is_violating_now = True
                
                # B. ตรวจเส้นนอน (Y) - วิ่งลง (Down/สวน)
                elif ROI_Y and y1 < ROI_Y < y2 and direction == "Down":
                    if track_id not in tracked_down:
                        tracked_down.add(track_id); cnt_downward += 1

                # C. ตรวจเส้นตั้ง (X) - เลี้ยวซ้าย (Left)
                if ROI_X and x1 < ROI_X < x2 and direction == "Left":
                    if track_id not in tracked_x:
                        tracked_x.add(track_id); cnt_left += 1
                        if current_light == 'red': is_violating_now = True

                # --- 📸 จัดการเมื่อพบการฝ่าฝืน (Evidence Capture) ---
                if is_violating_now and track_id not in violated_ids:
                    violations += 1
                    violated_ids.add(track_id)
                    ts_str = time.strftime('%Y%m%d_%H%M%S')
                    
                    # 1. Save Image Snapshot
                    img_name = f"violation_{track_id}_{ts_str}.jpg"
                    img_path = os.path.join("evidences/images", img_name)
                    cv2.imwrite(img_path, frame)
                    
                    # 2. Start Video Recording (Capture the moment)
                    vid_name = f"violation_{track_id}_{ts_str}.mp4"
                    vid_path = os.path.join("evidences/videos", vid_name)
                    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                    out_vid = cv2.VideoWriter(vid_path, fourcc, fps, (width, height))
                    
                    # Write pre-incident frames from buffer
                    for b_frame in buffer_frames:
                        out_vid.write(b_frame)
                    
                    active_recordings[track_id] = [out_vid, 0, vid_path, v_type, img_path]
                    print(f"🚨 VIOLATION: ID {track_id} ({v_type}) at {ts_str}!")

                # วาดรถ (กรอบแดงถ้าฝ่าไฟแดง, กรอบเขียวถ้าปกติ)
                color = (0, 0, 255) if track_id in violated_ids else (0, 255, 0)
                cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(display_frame, f"ID:{track_id} {display_dir}", (x1, y1-5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        # --- 🎬 บันทึกวิดีโอต่อเนื่องสำหรับเคสที่ยังอัดไม่ครบ 5 วินาที ---
        for vid_id in list(active_recordings.keys()):
            writer, f_count, v_path, v_type, i_path = active_recordings[vid_id]
            writer.write(frame)
            active_recordings[vid_id][1] += 1
            
            # อัดต่อ 3 วินาที (รวม Buffer 2 วินาที = 5 วินาทีพอดี)
            if active_recordings[vid_id][1] > int(fps * 3):
                writer.release()
                log_violation_to_db(vid_id, v_type, "RED", i_path, v_path)
                del active_recordings[vid_id]

        # --- 🔴 วาดเส้น ROI และ UI ทั้งหมด (รักษาของเดิมไว้ครบถ้วน) 🔴 ---
        if ROI_Y:
            cv2.line(display_frame, (0, ROI_Y), (width, ROI_Y), (0, 255, 0), 2)
            cv2.putText(display_frame, "FORWARD LINE (Y)", (10, ROI_Y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        
        if ROI_X:
            cv2.line(display_frame, (ROI_X, 0), (ROI_X, height), (255, 255, 0), 2)
            cv2.putText(display_frame, "LEFT TURN LINE (X)", (ROI_X+5, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

        if VEH_ZONE:
            cv2.rectangle(display_frame, (VEH_ZONE[0], VEH_ZONE[1]), (VEH_ZONE[2], VEH_ZONE[3]), (0, 255, 255), 1)
            cv2.putText(display_frame, "VEHICLE ZONE", (VEH_ZONE[0], VEH_ZONE[1]-5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)

        if TL_BOX:
            cv2.rectangle(display_frame, (TL_BOX[0], TL_BOX[1]), (TL_BOX[2], TL_BOX[3]), (255, 255, 255), 1)
            cv2.putText(display_frame, "TRAFFIC MONITOR", (TL_BOX[0], TL_BOX[1]-5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

        # สัญญาณไฟแสดงสถานะมุมขวาบน
        lc = (0,0,255) if current_light=='red' else (0,255,0) if current_light=='green' else (0,255,255) if current_light=='yellow' else (128,128,128)
        cv2.circle(display_frame, (width - 40, 40), 20, (50,50,50), -1)
        cv2.circle(display_frame, (width - 40, 40), 17, lc, -1)
        
        # รายงานสรุปผล
        cv2.putText(display_frame, f"FORWARD: {cnt_forward}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2)
        cv2.putText(display_frame, f"LEFT TURN: {cnt_left}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,0), 2)
        cv2.putText(display_frame, f"DOWNWARD (สวน): {cnt_downward}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200,200,255), 2)
        cv2.putText(display_frame, f"TOTAL VIOLATIONS: {violations}", (20, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)

        cv2.imshow('Thesis: Advanced Traffic Enforcement', display_frame)
        if cv2.waitKey(1) & 0xFF == ord('q'): break

    # Cleanup
    cap.release()
    for vid_id in active_recordings:
        active_recordings[vid_id][0].release()
    cv2.destroyAllWindows()

if __name__ == '__main__':
    run()
