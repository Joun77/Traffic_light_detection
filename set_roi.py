#!/usr/bin/python
# -*- coding: utf-8 -*-
# set_roi.py — กำหนด ROI Line + ตำแหน่งไฟจราจรด้วยเมาส์
#
# วิธีใช้:
#   python set_roi.py
#
# ขั้นตอน:
#   1) คลิก 1 ครั้ง เพื่อวาง ROI Line (เส้นนับรถ)
#   2) กด N เพื่อไปขั้นต่อไป
#   3) คลิกลากเพื่อเลือกกรอบไฟจราจร
#   4) กด Enter เพื่อบันทึก | Q เพื่อออก

import cv2
import json
import os

VIDEO = 'IMG_9582.MOV'
CONFIG_FILE = 'roi_config.json'

# --- State ---
step = 1          # 1=set ROI line, 2=set traffic light box
roi_y = None
tl_box = None     # (x1, y1, x2, y2) traffic light region
drawing = False
drag_start = None
frame_display = None
original_frame = None
scale = 1.0

def draw_ui():
    global frame_display
    frame_display = original_frame.copy()
    h, w = frame_display.shape[:2]

    # วาด ROI line
    if roi_y is not None:
        cv2.line(frame_display, (0, roi_y), (w, roi_y), (0, 255, 0), 3)
        cv2.putText(frame_display, f'ROI y={roi_y}', (10, roi_y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

    # วาดกรอบไฟจราจร
    if tl_box is not None:
        x1, y1, x2, y2 = tl_box
        cv2.rectangle(frame_display, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(frame_display, 'Traffic Light', (x1, y1 - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

    # คำแนะนำ
    if step == 1:
        msg = 'STEP 1: Click to set ROI Line  |  N = next step'
    else:
        msg = 'STEP 2: Drag to select Traffic Light area  |  Enter = Save  |  Q = Quit'
    cv2.putText(frame_display, msg, (10, 35),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 255), 2)
    cv2.imshow('ROI Setup', frame_display)


def mouse_callback(event, x, y, flags, param):
    global roi_y, tl_box, drawing, drag_start, frame_display

    if step == 1:
        if event == cv2.EVENT_LBUTTONDOWN:
            roi_y = y
            draw_ui()

    elif step == 2:
        if event == cv2.EVENT_LBUTTONDOWN:
            drawing = True
            drag_start = (x, y)

        elif event == cv2.EVENT_MOUSEMOVE and drawing:
            tmp = original_frame.copy()
            h, w = tmp.shape[:2]
            if roi_y:
                cv2.line(tmp, (0, roi_y), (w, roi_y), (0, 255, 0), 3)
            cv2.rectangle(tmp, drag_start, (x, y), (0, 0, 255), 2)
            cv2.putText(tmp, 'STEP 2: Drag to select Traffic Light area  |  Enter = Save  |  Q = Quit',
                        (10, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 255), 2)
            cv2.imshow('ROI Setup', tmp)

        elif event == cv2.EVENT_LBUTTONUP and drawing:
            drawing = False
            x1, y1 = drag_start
            x2, y2 = x, y
            tl_box = (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))
            draw_ui()


def main():
    global frame_display, original_frame, scale, step, roi_y, tl_box

    cap = cv2.VideoCapture(VIDEO)
    if not cap.isOpened():
        print(f"Error: ไม่พบ '{VIDEO}'")
        return

    ret, frame = cap.read()
    cap.release()
    if not ret:
        print("Error: อ่าน frame ไม่ได้")
        return

    # Scale ลงให้พอหน้าจอ
    h, w = frame.shape[:2]
    scale = min(900 / h, 1200 / w, 1.0)
    if scale < 1.0:
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
    original_frame = frame.copy()

    # โหลด config เดิม
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE) as f:
            cfg = json.load(f)
        disp_y = cfg.get('display_y')
        if disp_y:
            roi_y = disp_y
        tb = cfg.get('traffic_light_box_display')
        if tb:
            tl_box = tuple(tb)

    cv2.namedWindow('ROI Setup')
    cv2.setMouseCallback('ROI Setup', mouse_callback)
    draw_ui()

    print("=" * 50)
    print("STEP 1: คลิกบนภาพเพื่อวาง ROI Line แล้วกด N")
    print("STEP 2: ลากเมาส์เพื่อเลือกกรอบไฟจราจร")
    print("Enter = บันทึก | Q = ออก")
    print("=" * 50)

    while True:
        key = cv2.waitKey(0) & 0xFF

        if key == ord('n') or key == ord('N'):
            if step == 1:
                if roi_y is None:
                    print("กรุณาคลิกเลือก ROI Line ก่อน!")
                    continue
                step = 2
                print("STEP 2: ลากเมาส์เลือกกรอบไฟจราจร")
                draw_ui()

        elif key in [13, 32]:  # Enter / Space
            if roi_y is None:
                print("กรุณาเลือก ROI Line ก่อน!")
                continue

            # แปลงกลับเป็น original video coordinates
            actual_y = int(roi_y / scale) if scale < 1.0 else roi_y
            config = {
                'roi_y': actual_y,
                'display_y': roi_y,
                'scale': scale
            }
            if tl_box is not None:
                x1, y1, x2, y2 = tl_box
                config['traffic_light_box_display'] = list(tl_box)
                config['traffic_light_box'] = [
                    int(x1 / scale), int(y1 / scale),
                    int(x2 / scale), int(y2 / scale)
                ]

            with open(CONFIG_FILE, 'w') as f:
                json.dump(config, f, indent=2)

            print(f"บันทึกแล้ว!")
            print(f"  ROI y          = {actual_y}")
            if tl_box:
                print(f"  Traffic Light  = {config['traffic_light_box']}")
            break

        elif key == ord('q'):
            print("ออกโดยไม่บันทึก")
            break

    cv2.destroyAllWindows()


if __name__ == '__main__':
    main()
