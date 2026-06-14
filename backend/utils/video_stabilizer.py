#!/usr/bin/python
# -*- coding: utf-8 -*-
# video_stabilizer.py — Digital Video Stabilization using Optical Flow
# ใช้ feature tracking เพื่อ smooth กล้องที่สั่นไหว

import cv2
import numpy as np


class VideoStabilizer:
    """
    Stabilize video frames ด้วย Lucas-Kanade Optical Flow
    วิธีการ:
      1) track feature points ระหว่าง frame
      2) คำนวณ rigid transform (translation + rotation)
      3) smooth trajectory ด้วย rolling average
      4) apply inverse transform เพื่อชดเชยการสั่น
    """

    def __init__(self, smoothing_radius=30):
        """
        smoothing_radius: จำนวน frame ที่ใช้ smooth (มากขึ้น = นิ่งกว่า แต่ lag มากกว่า)
        """
        self.smoothing_radius = smoothing_radius
        self.prev_gray = None
        self.trajectory = []          # สะสม transform ทุก frame
        self.smoothed = []
        self._transforms = []         # raw transforms

    def _get_transform(self, prev_gray, curr_gray):
        """คำนวณ transform matrix ระหว่าง 2 frame"""
        # หา feature points ใน frame ก่อน
        prev_pts = cv2.goodFeaturesToTrack(
            prev_gray,
            maxCorners=200,
            qualityLevel=0.01,
            minDistance=30,
            blockSize=3
        )
        if prev_pts is None or len(prev_pts) < 5:
            return None

        # Track ไปยัง frame ปัจจุบัน
        curr_pts, status, _ = cv2.calcOpticalFlowPyrLK(
            prev_gray, curr_gray, prev_pts, None
        )

        # เอาเฉพาะ point ที่ track สำเร็จ
        good_prev = prev_pts[status == 1]
        good_curr = curr_pts[status == 1]

        if len(good_prev) < 4:
            return None

        # หา partial affine transform (translation + rotation + scale)
        m, _ = cv2.estimateAffinePartial2D(good_prev, good_curr)
        return m

    def stabilize(self, frame):
        """
        รับ frame ดิบ คืน frame ที่ stable แล้ว
        frame แรกจะคืนค่าเดิม (ยังไม่มี reference)
        """
        curr_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if self.prev_gray is None:
            self.prev_gray = curr_gray
            self._transforms.append(np.eye(2, 3, dtype=np.float32))
            return frame

        m = self._get_transform(self.prev_gray, curr_gray)
        if m is None:
            m = np.eye(2, 3, dtype=np.float32)

        self._transforms.append(m)
        self.prev_gray = curr_gray

        # คำนวณ smooth transform
        n = len(self._transforms)
        start = max(0, n - self.smoothing_radius)
        window = self._transforms[start:n]

        # average dx, dy, angle จาก window
        avg_dx    = np.mean([t[0, 2] for t in window])
        avg_dy    = np.mean([t[1, 2] for t in window])
        avg_cos   = np.mean([t[0, 0] for t in window])
        avg_sin   = np.mean([t[1, 0] for t in window])

        # smooth transform
        smooth_m = np.array([
            [avg_cos, -avg_sin, avg_dx],
            [avg_sin,  avg_cos, avg_dy]
        ], dtype=np.float32)

        # inverse: ชดเชยด้วย difference ระหว่าง raw กับ smooth
        diff_dx = smooth_m[0, 2] - m[0, 2]
        diff_dy = smooth_m[1, 2] - m[1, 2]

        stabilize_m = np.array([
            [1, 0, diff_dx],
            [0, 1, diff_dy]
        ], dtype=np.float32)

        h, w = frame.shape[:2]
        stabilized = cv2.warpAffine(frame, stabilize_m, (w, h),
                                    flags=cv2.INTER_LINEAR,
                                    borderMode=cv2.BORDER_REPLICATE)
        return stabilized
