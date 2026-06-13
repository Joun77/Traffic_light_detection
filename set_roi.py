#!/usr/bin/python
# -*- coding: utf-8 -*-
# set_roi.py — กำหนด ROI Line (Y, X) + พื้นที่ไฟจราจร + พื้นที่ตรวจจับรถ
import cv2
import json
import os

VIDEO = 'IMG_9582.MOV'
CONFIG_FILE = 'roi_config.json'

# Step: 1=ROI Y, 2=ROI X, 3=Traffic Light, 4=Vehicle Zone
step = 1
roi_y = None
roi_x = None
tl_box = None
veh_zone = None
drawing = False
drag_start = None
original_frame = None
scale = 1.0

def draw_ui():
    global frame_display
    frame_display = original_frame.copy()
    h, w = frame_display.shape[:2]

    if roi_y is not None:
        cv2.line(frame_display, (0, roi_y), (w, roi_y), (0, 255, 0), 2)
    if roi_x is not None:
        cv2.line(frame_display, (roi_x, 0), (roi_x, h), (255, 255, 0), 2)
    if tl_box is not None:
        cv2.rectangle(frame_display, (tl_box[0], tl_box[1]), (tl_box[2], tl_box[3]), (0, 0, 255), 2)
        cv2.putText(frame_display, "Light", (tl_box[0], tl_box[1]-5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
    if veh_zone is not None:
        cv2.rectangle(frame_display, (veh_zone[0], veh_zone[1]), (veh_zone[2], veh_zone[3]), (0, 255, 255), 2)
        cv2.putText(frame_display, "Vehicle Zone", (veh_zone[0], veh_zone[1]-5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

    msgs = {
        1: "STEP 1: Click for HORIZONTAL (Y) | N=Next",
        2: "STEP 2: Click for VERTICAL (X) | N=Next",
        3: "STEP 3: Drag for TRAFFIC LIGHT area | N=Next",
        4: "STEP 4: Drag for VEHICLE DETECTION zone | Enter=Save | Q=Quit"
    }
    cv2.putText(frame_display, msgs.get(step, ""), (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    cv2.imshow('ROI Setup', frame_display)

def mouse_callback(event, x, y, flags, param):
    global roi_y, roi_x, tl_box, veh_zone, drawing, drag_start
    if event == cv2.EVENT_LBUTTONDOWN:
        if step == 1: roi_y = y; draw_ui()
        elif step == 2: roi_x = x; draw_ui()
        elif step in [3, 4]: drawing, drag_start = True, (x, y)
    elif event == cv2.EVENT_MOUSEMOVE and drawing:
        tmp = frame_display.copy()
        cv2.rectangle(tmp, drag_start, (x, y), (255, 255, 255), 2)
        cv2.imshow('ROI Setup', tmp)
    elif event == cv2.EVENT_LBUTTONUP and drawing:
        drawing = False
        box = (min(drag_start[0], x), min(drag_start[1], y), max(drag_start[0], x), max(drag_start[1], y))
        if step == 3: tl_box = box
        elif step == 4: veh_zone = box
        draw_ui()

def main():
    global original_frame, scale, step, roi_y, roi_x, tl_box, veh_zone
    cap = cv2.VideoCapture(VIDEO)
    ret, frame = cap.read()
    cap.release()
    if not ret: return
    h, w = frame.shape[:2]
    scale = min(900 / h, 1200 / w, 1.0)
    original_frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
    cv2.namedWindow('ROI Setup')
    cv2.setMouseCallback('ROI Setup', mouse_callback)
    draw_ui()
    while True:
        key = cv2.waitKey(0) & 0xFF
        if key == ord('n') or key == ord('N'):
            if step < 4: step += 1; draw_ui()
        elif key in [13, 32]:
            config = {
                'roi_y': int(roi_y / scale) if roi_y else None,
                'roi_x': int(roi_x / scale) if roi_x else None,
                'traffic_light_box': [int(v / scale) for v in tl_box] if tl_box else None,
                'vehicle_zone': [int(v / scale) for v in veh_zone] if veh_zone else None,
                'scale': scale
            }
            with open(CONFIG_FILE, 'w') as f: json.dump(config, f, indent=2)
            print("Saved config!"); break
        elif key == ord('q'): break
    cv2.destroyAllWindows()

if __name__ == '__main__': main()
