#!/usr/bin/python
# -*- coding: utf-8 -*-
# vehicle_detection_main.py
# ระบบตรวจจับรถและตรวจจับการฝ่าไฟแดง
# ใช้ YOLO26 (Ultralytics) + Video Stabilization
#
# วิธีรัน:
#   python vehicle_detection_main.py imshow   <- แสดงผลหน้าจอ
#   python vehicle_detection_main.py imwrite  <- บันทึกไฟล์วิดีโอ
#
# กด Q เพื่อหยุดโปรแกรม

import cv2
import numpy as np
import csv
import time
import os
import json
import argparse
from ultralytics import YOLO
from utils.video_stabilizer import VideoStabilizer

# ============================================================
# CONFIG
# ============================================================
VIDEO_SOURCE   = 'IMG_9582.MOV'
MODEL_NAME     = 'yolo26s.pt'          # nano=เร็ว, small=สมดุล, medium=แม่น
CONFIDENCE     = 0.35                   # ค่า confidence ขั้นต่ำ
ROI_CONFIG     = 'roi_config.json'

# COCO class IDs สำหรับยานพาหนะ
VEHICLE_CLASSES = {
    2:  'car',
    3:  'motorcycle',
    5:  'bus',
    7:  'truck',
}

# ============================================================
# LOAD ROI CONFIG
# ============================================================
ROI_Y  = 1100
TL_BOX = None   # traffic light bounding box (x1,y1,x2,y2)

if os.path.exists(ROI_CONFIG):
    with open(ROI_CONFIG) as f:
        cfg = json.load(f)
    ROI_Y  = cfg.get('roi_y', ROI_Y)
    TL_BOX = cfg.get('traffic_light_box', None)
    print(f"[CONFIG] ROI y={ROI_Y}  |  Traffic Light box={TL_BOX}")
else:
    print("[CONFIG] ไม่พบ roi_config.json — ใช้ค่า default")
    print("         รัน: python set_roi.py เพื่อกำหนดตำแหน่ง")

# ============================================================
# TRAFFIC LIGHT DETECTION
# ============================================================
_light_history = []

def detect_traffic_light(frame, box):
    """
    ตรวจสีไฟจราจรด้วย 2 วิธีรวมกัน:
    1) แบ่งกรอบเป็น 3 ส่วน (บน=แดง / กลาง=เหลือง / ล่าง=เขียว)
       แล้วดูว่าส่วนไหนสว่างที่สุด
    2) ยืนยันด้วยสี HSV
    """
    x1, y1, x2, y2 = [int(v) for v in box]
    roi = frame[y1:y2, x1:x2]
    if roi.size == 0:
        return 'unknown'

    h = roi.shape[0]
    mg = max(1, h // 10)
    top = roi[mg        : h//3 - mg,    :]
    mid = roi[h//3 + mg : 2*h//3 - mg, :]
    bot = roi[2*h//3+mg : h - mg,       :]

    def bright(r):
        return float(np.mean(cv2.cvtColor(r, cv2.COLOR_BGR2GRAY))) if r.size > 0 else 0

    bt, bm, bb = bright(top), bright(mid), bright(bot)
    best = max(bt, bm, bb)
    if best < 30:
        return 'unknown'

    ratio = 1.20
    if bt > bm * ratio and bt > bb * ratio:
        pos, region = 'red',    top
    elif bb > bt * ratio and bb > bm * ratio:
        pos, region = 'green',  bot
    elif bm > bt * ratio and bm > bb * ratio:
        pos, region = 'yellow', mid
    else:
        return 'unknown'

    # ยืนยัน HSV
    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
    area = region.shape[0] * region.shape[1]
    if pos == 'red':
        ok = (cv2.countNonZero(cv2.inRange(hsv, np.array([0,80,80]),   np.array([15,255,255]))) +
              cv2.countNonZero(cv2.inRange(hsv, np.array([155,80,80]), np.array([180,255,255])))) > area * 0.03
    elif pos == 'green':
        ok = cv2.countNonZero(cv2.inRange(hsv, np.array([35,50,50]),   np.array([95,255,255]))) > area * 0.03
    else:
        ok = cv2.countNonZero(cv2.inRange(hsv, np.array([15,80,80]),   np.array([40,255,255]))) > area * 0.03

    return pos if ok else 'unknown'


def get_stable_light(frame, box, history_size=5):
    """Majority voting จาก N frame ล่าสุด"""
    global _light_history
    _light_history.append(detect_traffic_light(frame, box))
    if len(_light_history) > history_size:
        _light_history.pop(0)
    counts = {}
    for r in _light_history:
        if r != 'unknown':
            counts[r] = counts.get(r, 0) + 1
    return max(counts, key=counts.get) if counts else 'unknown'


# ============================================================
# DRAW HELPERS
# ============================================================
LIGHT_COLOR_MAP = {
    'red':     (0,   0,   255),
    'green':   (0,   255, 0),
    'yellow':  (0,   255, 255),
    'unknown': (128, 128, 128),
}

def draw_traffic_light_indicator(frame, light, pos=(None, 50)):
    h, w = frame.shape[:2]
    cx = w - 70 if pos[0] is None else pos[0]
    cy = pos[1]
    color = LIGHT_COLOR_MAP.get(light, (128, 128, 128))
    cv2.circle(frame, (cx, cy), 28, (50, 50, 50), -1)
    cv2.circle(frame, (cx, cy), 25, color, -1)
    cv2.putText(frame, light.upper(), (cx - 35, cy + 45),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)


def draw_roi_line(frame, y, roi_color):
    h, w = frame.shape[:2]
    cv2.line(frame, (0, y), (w, y), roi_color, 4)
    cv2.putText(frame, 'ROI', (10, y - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, roi_color, 2)


# ============================================================
# MAIN DETECTION FUNCTION
# ============================================================
def run(command):
    # โหลดโมเดล YOLO26
    print(f"[YOLO] กำลังโหลดโมเดล {MODEL_NAME} ...")
    model = YOLO(MODEL_NAME)
    print("[YOLO] โหลดสำเร็จ!")

    # เปิดวิดีโอ
    cap = cv2.VideoCapture(VIDEO_SOURCE)
    if not cap.isOpened():
        print(f"Error: ไม่พบวิดีโอ '{VIDEO_SOURCE}'")
        return

    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = int(cap.get(cv2.CAP_PROP_FPS)) or 30

    print(f"[VIDEO] {width}x{height} @ {fps}fps")

    # Output video
    writer = None
    if command == 'imwrite':
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out_path = VIDEO_SOURCE.rsplit('.', 1)[0] + '_output.mp4'
        writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height))
        print(f"[OUTPUT] บันทึกไปที่ {out_path}")

    # CSV
    with open('traffic_measurement.csv', 'w', newline='') as f:
        csv.writer(f).writerow(['Time', 'Vehicle#', 'Type', 'Light', 'Violation'])
    with open('violations.csv', 'w', newline='') as f:
        csv.writer(f).writerow(['Time', 'Vehicle#', 'Type', 'Light'])

    # ตัวแปร
    stabilizer     = VideoStabilizer(smoothing_radius=30)
    total_vehicles = 0
    violations     = 0
    current_light  = 'unknown'
    frame_count    = 0

    # track ว่า vehicle ID ไหนผ่านเส้น ROI ไปแล้ว (ป้องกันนับซ้ำ)
    crossed_ids = set()

    print("[START] กด Q เพื่อหยุด")
    print("=" * 50)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            print("จบวิดีโอ")
            break

        frame_count += 1

        # --- Video Stabilization ---
        frame = stabilizer.stabilize(frame)

        # --- Traffic Light Detection ---
        if TL_BOX:
            current_light = get_stable_light(frame, TL_BOX)

        # --- YOLO Detection ---
        results = model(frame, conf=CONFIDENCE, verbose=False)[0]

        # --- ตรวจจับไฟจราจรอัตโนมัติจาก YOLO (class 9 = traffic light) ---
        # Filter เพื่อกรองไฟเบรกท้ายรถออก:
        #   1) ไฟจราจรจริงต้องอยู่ในครึ่งบนของภาพ (y < height * 0.65)
        #   2) ขนาด box ต้องเล็ก (กว้าง < width*0.05, สูง < height*0.12)
        #   3) box ต้องสูงกว่ากว้าง (traffic light เป็นแท่งตั้ง)
        tl_boxes = []
        for box in results.boxes:
            if int(box.cls[0]) != 9:
                continue
            bx1, by1, bx2, by2 = map(int, box.xyxy[0])
            bw = bx2 - bx1
            bh = by2 - by1
            # กรองเงื่อนไข
            in_upper_half  = by2 < height * 0.65           # อยู่บนครึ่งบน
            small_enough   = bw < width * 0.05             # ไม่กว้างเกิน 5% ของภาพ
            tall_box       = bh > bw * 1.2                 # สูงกว่ากว้าง (แท่งตั้ง)
            not_too_small  = bw > 10 and bh > 20           # ไม่เล็กเกินไป
            if in_upper_half and small_enough and tall_box and not_too_small:
                tl_boxes.append((bx1, by1, bx2, by2))

        if tl_boxes:
            # เลือก box ที่ confidence สูงสุด (อยู่ใน list แรก = sorted โดย YOLO)
            best_tl = tl_boxes[0]
            current_light = get_stable_light(frame, best_tl)
            bx1, by1, bx2, by2 = best_tl
            lc = LIGHT_COLOR_MAP.get(current_light, (128,128,128))
            cv2.rectangle(frame, (bx1, by1), (bx2, by2), lc, 3)
            cv2.putText(frame, f'TrafficLight:{current_light}',
                        (bx1, by1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.55, lc, 2)
        elif TL_BOX:
            # fallback: ใช้ manual box จาก set_roi.py
            # แต่ต้องอยู่ในครึ่งบนของภาพเท่านั้น
            _, tby1, _, tby2 = TL_BOX
            if tby2 < height * 0.55:
                current_light = get_stable_light(frame, TL_BOX)
            else:
                # box ต่ำเกินไป = น่าจะเป็นไฟท้ายรถ ไม่ใช้
                current_light = 'unknown'

        # --- Process Vehicle Detections ---
        crossed_this_frame = False
        vehicle_type = 'vehicle'

        for box in results.boxes:
            cls_id = int(box.cls[0])
            if cls_id not in VEHICLE_CLASSES:
                continue

            # bounding box
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf   = float(box.conf[0])
            label  = VEHICLE_CLASSES[cls_id]
            track_id = int(box.id[0]) if box.id is not None else -1

            # วาดกล่อง
            box_color = (0, 255, 255)
            cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
            cv2.putText(frame, f'{label} {conf:.2f}',
                        (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.55, box_color, 2)

            # ตรวจว่า bounding box ตัดผ่านเส้น ROI ไหม
            center_y = (y1 + y2) // 2
            if y1 < ROI_Y < y2 or abs(center_y - ROI_Y) < 20:
                if track_id not in crossed_ids or track_id == -1:
                    if track_id != -1:
                        crossed_ids.add(track_id)
                    crossed_this_frame = True
                    vehicle_type = label

        # --- นับ + ตรวจ Violation ---
        is_violation = False
        if crossed_this_frame:
            total_vehicles += 1
            ts = time.strftime('%H:%M:%S')
            is_violation = (current_light == 'red')

            if is_violation:
                violations += 1
                with open('violations.csv', 'a', newline='') as f:
                    csv.writer(f).writerow([ts, total_vehicles, vehicle_type, 'RED'])
                print(f"[VIOLATION] รถคันที่ {total_vehicles} ฝ่าไฟแดง! {ts}")

            with open('traffic_measurement.csv', 'a', newline='') as f:
                csv.writer(f).writerow([ts, total_vehicles, vehicle_type,
                                        current_light, 'YES' if is_violation else 'NO'])

        # --- วาด ROI Line ---
        if crossed_this_frame and is_violation:
            roi_color = (0, 0, 255)       # แดง = violation
        elif crossed_this_frame:
            roi_color = (0, 255, 0)       # เขียว = ผ่านปกติ
        else:
            roi_color = (255, 100, 0)     # น้ำเงิน = รอ
        draw_roi_line(frame, ROI_Y, roi_color)

        # --- HUD ---
        draw_traffic_light_indicator(frame, current_light)

        cv2.putText(frame, f'Vehicles: {total_vehicles}', (10, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)
        cv2.putText(frame, f'Violations: {violations}', (10, 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)

        if is_violation:
            cv2.putText(frame, '!! RED LIGHT VIOLATION !!',
                        (width // 2 - 280, height // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.8, (0, 0, 255), 4)

        # (traffic light box วาดในส่วน YOLO detection แล้ว)

        # --- Output ---
        if command == 'imshow':
            cv2.imshow('Vehicle Detection — YOLO26', frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        elif command == 'imwrite' and writer:
            writer.write(frame)

    # Cleanup
    cap.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()

    print("=" * 50)
    print(f"[DONE] รถทั้งหมด: {total_vehicles}  |  Violations: {violations}")
    print("บันทึกผลไว้ใน traffic_measurement.csv และ violations.csv")


# ============================================================
# ENTRY POINT
# ============================================================
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Vehicle Detection — YOLO26')
    parser.add_argument('command', choices=['imshow', 'imwrite'],
                        help='imshow = แสดงหน้าจอ, imwrite = บันทึกวิดีโอ')
    args = parser.parse_args()
    run(args.command)
