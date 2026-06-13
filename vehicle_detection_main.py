#!/usr/bin/python
# -*- coding: utf-8 -*-
# vehicle_detection_main.py (All Features: Multi-Direction, Violations, and Visual ROI)

import cv2
import numpy as np
import csv
import time
import os
import json
import argparse
from ultralytics import YOLO

# ============================================================
# CONFIG
# ============================================================
VIDEO_SOURCE      = 'IMG_9582.MOV'
VEHICLE_MODEL     = 'yolo26s.pt'
TRAFFIC_MODEL     = 'traffic_light_results/weights/best.pt'
CONFIDENCE        = 0.35
ROI_CONFIG        = 'roi_config.json'

VEHICLE_CLASSES = {2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'}

# LOAD CONFIG
ROI_Y = None; ROI_X = None; TL_BOX = None; VEH_ZONE = None
if os.path.exists(ROI_CONFIG):
    with open(ROI_CONFIG) as f:
        cfg = json.load(f)
    ROI_Y  = cfg.get('roi_y')
    ROI_X  = cfg.get('roi_x')
    TL_BOX = cfg.get('traffic_light_box')
    VEH_ZONE = cfg.get('vehicle_zone')
    print(f"[CONFIG] Loaded All ROI Settings")
else:
    print("[ERROR] No roi_config.json found.")

def is_inside(box, area):
    if area is None: return True
    bx1, by1, bx2, by2 = box
    cx, cy = (bx1 + bx2) // 2, (by1 + by2) // 2
    ax1, ay1, ax2, ay2 = area
    return (ax1 <= cx <= ax2) and (ay1 <= cy <= ay2)

def run():
    print("[YOLO] Loading Models...")
    v_model = YOLO(VEHICLE_MODEL)
    t_model = YOLO(TRAFFIC_MODEL)
    
    cap = cv2.VideoCapture(VIDEO_SOURCE)
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    pos_history = {}
    tracked_y = set(); tracked_down = set(); tracked_x = set()
    violated_ids = set()
    
    cnt_forward = 0; cnt_downward = 0; cnt_left = 0; violations = 0
    current_light = 'unknown'

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        # 1. ตรวจจับไฟจราจร
        t_results = t_model(frame, conf=0.4, verbose=False)[0]
        if len(t_results.boxes) > 0:
            for box in t_results.boxes:
                b = list(map(int, box.xyxy[0]))
                if is_inside(b, TL_BOX):
                    current_light = t_model.names[int(box.cls[0])]
                    # วาดกรอบส่องไฟ
                    cv2.rectangle(frame, (b[0], b[1]), (b[2], b[3]), (255, 255, 255), 2)
                    break

        # 2. ตรวจจับรถ
        v_results = v_model.track(frame, persist=True, conf=CONFIDENCE, verbose=False)[0]
        if v_results.boxes.id is not None:
            boxes = v_results.boxes.xyxy.cpu().numpy()
            ids = v_results.boxes.id.cpu().numpy().astype(int)
            clss = v_results.boxes.cls.cpu().numpy().astype(int)

            for box, track_id, cls in zip(boxes, ids, clss):
                if cls not in VEHICLE_CLASSES: continue
                if not is_inside(list(map(int, box)), VEH_ZONE): continue
                
                x1, y1, x2, y2 = map(int, box)
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                
                # ทิศทาง
                direction = "Static"
                if track_id in pos_history:
                    prev_cx, prev_cy = pos_history[track_id]
                    dy, dx = cy - prev_cy, cx - prev_cx
                    if abs(dy) > abs(dx): direction = "Down" if dy > 0 else "Up"
                    else: direction = "Right" if dx > 0 else "Left"
                pos_history[track_id] = (cx, cy)

                # Counting Logic
                if ROI_Y and y1 < ROI_Y < y2:
                    if direction == "Up" and track_id not in tracked_y:
                        tracked_y.add(track_id); cnt_forward += 1
                        if current_light == 'red' and track_id not in violated_ids:
                            violations += 1; violated_ids.add(track_id)
                    elif direction == "Down" and track_id not in tracked_down:
                        tracked_down.add(track_id); cnt_downward += 1

                if ROI_X and x1 < ROI_X < x2 and direction == "Left" and track_id not in tracked_x:
                    tracked_x.add(track_id); cnt_left += 1
                    if current_light == 'red' and track_id not in violated_ids:
                        violations += 1; violated_ids.add(track_id)

                # วาดรถ
                color = (0, 0, 255) if track_id in violated_ids else (0, 255, 0)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(frame, f"ID:{track_id} {direction}", (x1, y1-5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        # --- 🔴 วาดเส้น ROI และพื้นที่ต่างๆ กลับคืนมา 🔴 ---
        if ROI_Y:
            cv2.line(frame, (0, ROI_Y), (width, ROI_Y), (0, 255, 0), 2)
            cv2.putText(frame, "FORWARD LINE (Y)", (10, ROI_Y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        
        if ROI_X:
            cv2.line(frame, (ROI_X, 0), (ROI_X, height), (255, 255, 0), 2)
            cv2.putText(frame, "LEFT TURN LINE (X)", (ROI_X+5, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

        if VEH_ZONE:
            cv2.rectangle(frame, (VEH_ZONE[0], VEH_ZONE[1]), (VEH_ZONE[2], VEH_ZONE[3]), (0, 255, 255), 1)
            cv2.putText(frame, "VEHICLE ZONE", (VEH_ZONE[0], VEH_ZONE[1]-5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)

        if TL_BOX:
            cv2.rectangle(frame, (TL_BOX[0], TL_BOX[1]), (TL_BOX[2], TL_BOX[3]), (255, 255, 255), 1)
            cv2.putText(frame, "TRAFFIC MONITOR", (TL_BOX[0], TL_BOX[1]-5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

        # UI แสดงผลมุมจอ
        lc = (0,0,255) if current_light=='red' else (0,255,0) if current_light=='green' else (0,255,255) if current_light=='yellow' else (128,128,128)
        cv2.circle(frame, (width - 40, 40), 15, lc, -1)
        cv2.putText(frame, f"FORWARD: {cnt_forward}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2)
        cv2.putText(frame, f"LEFT TURN: {cnt_left}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,0), 2)
        cv2.putText(frame, f"DOWNWARD (สวน): {cnt_downward}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200,200,255), 2)
        cv2.putText(frame, f"VIOLATIONS: {violations}", (20, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)

        cv2.imshow('Thesis System: Full Visual ROI', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'): break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == '__main__': run()
