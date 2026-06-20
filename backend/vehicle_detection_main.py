#!/usr/bin/python
# -*- coding: utf-8 -*-
"""
Red Light Violation Detection v4
Decision engine — two rules only:
  SAFE PASSAGE (only case): x increases consistently while/after crossing stop_x
                            → vehicle going right = oncoming lane or right turn
  VIOLATION    (all else):  crosses stop_x during red AND x is NOT consistently increasing
"""

import cv2
import math
import numpy as np
import time
import os
import json
import argparse
import requests
from collections import deque
from dataclasses import dataclass
from typing import Optional, Dict, Tuple, List
from ultralytics import YOLO

# ── Arguments ────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument('--video',         type=str, default=None)
parser.add_argument('--stop_line',     type=str, default=None,  help='x1,y1,x2,y2 — stop threshold line')
parser.add_argument('--direction_ref', type=str, default=None,  help='x1,y1,x2,y2 — lane direction axis')
parser.add_argument('--roi_y',         type=int, default=None,  help='Legacy: horizontal threshold y-coord')
parser.add_argument('--roi_x',         type=int, default=None,  help='Legacy: vertical stop line x-coord')
parser.add_argument('--tl_box',        type=str, default=None,  help='x1,y1,x2,y2 — traffic light ROI')
parser.add_argument('--veh_zone',      type=str, default=None,  help='x1,y1,x2,y2 — vehicle detection zone')
parser.add_argument('--camera_db_id',  type=int, default=None)
args = parser.parse_args()

# ── Pipeline constants ─────────────────────────────────────────
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
VEHICLE_MODEL = os.path.join(BASE_DIR, '../models/yolo26s.pt')
TRAFFIC_MODEL = os.path.join(BASE_DIR, '../models/traffic_light_results/weights/best.pt')
ROI_CONFIG    = os.path.join(BASE_DIR, '../data/roi_config.json')
OUTPUT_BASE   = os.path.join(BASE_DIR, '../outputs')
API_BASE      = 'http://localhost:8000'
STREAM_URL    = f'{API_BASE}/update-frame'

CONFIDENCE       = 0.25
STREAM_FPS       = 15
TARGET_HEIGHT    = 1080
TL_DETECT_EVERY  = 3
VIO_TOLERANCE    = 20
POST_VIO_SECS    = 3
MOTION_THRESHOLD = 2

# ── Decision engine thresholds ────────────────────────────────
SAFE_PASS_CHECK_SECS  = 0.4  # grace window after crossing: wait before declaring violation
SAFE_PASS_FRAMES      = 6    # frames to measure net x displacement for safe-passage check
NET_RIGHT_THRESHOLD   = 28   # px: net rightward displacement over SAFE_PASS_FRAMES required
                              # Camera shake is random ±noise → net ≈ 0.
                              # Genuine rightward travel accumulates → net > threshold.
MIN_MOVEMENT_PX       = 4    # minimum pixel displacement per frame to count as moving

VEHICLE_CLASSES = {2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck'}

# Annotation colors per verdict (BGR)
VERDICT_COLOR = {
    'approaching':  (0, 255, 0),     # green
    'pending':      (0, 220, 255),   # yellow
    'violated':     (0, 0, 255),     # red
    'safe_passage': (255, 130, 0),   # blue-orange
    'ignored':      (100, 100, 100), # gray
}


# ══════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ══════════════════════════════════════════════════════════════
@dataclass
class VehicleState:
    """Single-frame snapshot — LPR contract: pass bbox + crop_image_path to plate module."""
    track_id:     int
    vehicle_type: str
    bbox:         Tuple[int, int, int, int]
    center:       Tuple[int, int]
    lane_id:      Optional[int] = None
    direction_x:  str = "unknown"
    direction_y:  str = "unknown"
    dir_along:    str = "unknown"
    dir_perp:     str = "unknown"

    @property
    def cx(self): return self.center[0]

    @property
    def cy(self): return self.center[1]


@dataclass
class VehicleTrack:
    """
    Per-vehicle persistent state for the decision engine.

    positions — rolling (timestamp, cx, cy) window, maxlen=30 (~2 s at 15 fps)
    cross_t   — timestamp when center first crossed stop_x (set once per crossing event)
    state     — last verdict: approaching | pending | violated | safe_passage
    """
    positions: deque
    cross_t:   Optional[float] = None
    state:     str = 'approaching'


# ══════════════════════════════════════════════════════════════
# MODULE 1  —  Traffic Light Detector
# ══════════════════════════════════════════════════════════════
class TrafficLightDetector:
    def __init__(self, model: YOLO, tl_box: Optional[list], frame_w: int, frame_h: int):
        self.model     = model
        self.tl_box    = tl_box
        self.frame_w   = frame_w
        self.frame_h   = frame_h
        self.history   = deque(maxlen=15)
        self.current   = 'unknown'
        self._tick     = 0
        self._lost     = 0
        self._max_lost = 10

    def configure(self, proc_fps: int):
        detection_rate = max(1, proc_fps // TL_DETECT_EVERY)
        self._max_lost = int(detection_rate * 2.0)

    def update(self, frame: np.ndarray) -> str:
        if self.tl_box is None:
            return self.current
        self._tick += 1
        if self._tick % TL_DETECT_EVERY != 0:
            return self.current

        tx1, ty1, tx2, ty2 = map(int, self.tl_box)
        pad  = 40
        crop = frame[
            max(0, ty1-pad):min(self.frame_h, ty2+pad),
            max(0, tx1-pad):min(self.frame_w, tx2+pad),
        ]
        if crop.size > 0:
            res = self.model(crop, conf=0.25, verbose=False)[0]
            if res.boxes and len(res.boxes) > 0:
                label = self.model.names[int(res.boxes[0].cls[0])]
                self.history.append(label)
                self._lost = 0
            else:
                self._lost += 1
        else:
            self._lost += 1

        if self.history:
            self.current = max(set(self.history), key=list(self.history).count)
        if self._lost > self._max_lost:
            self.current = 'unknown'
        return self.current


# ══════════════════════════════════════════════════════════════
# MODULE 2  —  Lane Filter (Polygon-based)
# ══════════════════════════════════════════════════════════════
class LaneFilter:
    """
    Classifies vehicles by lane polygon using cv2.pointPolygonTest.
    Vehicles outside all polygons → lane_id=None → suppressed (false positive prevention).
    ROI config key: "lane_polygons": [[[x,y],...], ...]
    """
    _COLORS: List[Tuple[int, int, int]] = [
        (180, 50, 255), (50, 180, 255), (50, 255, 180), (255, 180, 50)
    ]

    def __init__(self, polygons_raw: Optional[list]):
        self.polygons: List[np.ndarray] = []
        if polygons_raw:
            for pts in polygons_raw:
                arr = np.array(pts, dtype=np.int32)
                if len(arr) >= 3:
                    self.polygons.append(arr.reshape((-1, 1, 2)))

    @property
    def enabled(self) -> bool:
        return len(self.polygons) > 0

    def classify(self, center: Tuple[int, int]) -> Optional[int]:
        if not self.enabled:
            return 0
        pt = (float(center[0]), float(center[1]))
        for i, poly in enumerate(self.polygons):
            if cv2.pointPolygonTest(poly, pt, False) >= 0:
                return i
        return None

    def draw(self, img: np.ndarray) -> None:
        for i, poly in enumerate(self.polygons):
            color = self._COLORS[i % len(self._COLORS)]
            overlay = img.copy()
            cv2.fillPoly(overlay, [poly], color)
            cv2.addWeighted(overlay, 0.10, img, 0.90, 0, img)
            cv2.polylines(img, [poly], isClosed=True, color=color, thickness=2)
            pts_flat = poly.reshape(-1, 2)
            cv2.putText(img, f"LANE {i+1}",
                        (int(pts_flat[:, 0].mean()), int(pts_flat[:, 1].mean())),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)


# ══════════════════════════════════════════════════════════════
# MODULE 3  —  Violation Checker — Decision Engine
# ══════════════════════════════════════════════════════════════
class ViolationChecker:
    """
    Two-rule decision engine:

      SAFE PASSAGE (only non-violation case):
        x increases monotonically for SAFE_PASS_FRAMES consecutive frames
        while/after crossing stop_x → vehicle going right = oncoming lane or right turn

      VIOLATION (all other cases):
        vehicle crosses stop_x during red AND x is NOT consistently increasing
        AND vehicle is moving (not stationary)

    Call flow per frame:
      track.positions.append((now, cx, cy))   ← caller does this first
      verdict = checker.evaluate_track(track, light)
    """
    def __init__(
        self,
        stop_line:     Optional[list],
        direction_ref: Optional[list],
        tolerance:     int,
        legacy_roi_x:  Optional[int] = None,
        legacy_roi_y:  Optional[int] = None,
    ):
        self.stop_line     = stop_line
        self.direction_ref = direction_ref
        self.tolerance     = tolerance
        self.roi_x         = legacy_roi_x
        self.roi_y         = legacy_roi_y

    def stop_x(self) -> Optional[int]:
        """X-coordinate of the stop threshold."""
        if self.stop_line:
            return (self.stop_line[0][0] + self.stop_line[1][0]) // 2
        return self.roi_x

    # ── Helpers ───────────────────────────────────────────────

    def _has_moved(self, track: VehicleTrack) -> bool:
        """True if vehicle displaced ≥ MIN_MOVEMENT_PX since previous frame."""
        if len(track.positions) < 2:
            return False
        _, p_cx, p_cy = track.positions[-2]
        _, cx,   cy   = track.positions[-1]
        return abs(cx - p_cx) > MIN_MOVEMENT_PX or abs(cy - p_cy) > MIN_MOVEMENT_PX

    def _x_net_rightward(self, track: VehicleTrack) -> bool:
        """
        True when the vehicle's NET x displacement over SAFE_PASS_FRAMES is
        greater than NET_RIGHT_THRESHOLD pixels.

        Why net displacement instead of strict monotonic:
          Camera shake = random ±noise → net Δx ≈ 0 over multiple frames.
          Real rightward movement = consistently accumulates → net Δx >> threshold.
          Strict monotonic fails with any single jitter frame; net is robust.
        """
        n = SAFE_PASS_FRAMES + 1
        if len(track.positions) < n:
            return False
        recent = list(track.positions)[-n:]
        net_dx = recent[-1][1] - recent[0][1]   # last_cx − first_cx
        return net_dx > NET_RIGHT_THRESHOLD

    # ── Main decision gate ────────────────────────────────────

    def evaluate_track(self, track: VehicleTrack, light: str) -> str:
        """
        Returns and stores verdict in track.state:
          'safe_passage' — x consistently increasing (only non-violation case)
          'violated'     — crossed stop_x during red, x NOT increasing, vehicle moving
          'pending'      — crossed but within grace window (waiting for trajectory)
          'approaching'  — not crossed yet, or light not red
        """
        sx = self.stop_x()
        if sx is None or not track.positions:
            return track.state

        _, cx, cy = track.positions[-1]
        now       = track.positions[-1][0]

        in_zone = abs(cx - sx) <= self.tolerance
        crossed = cx <= sx - self.tolerance     # clearly past the stop line

        # Reset when vehicle retreats completely — allows re-triggering
        if not in_zone and not crossed and track.state in ('safe_passage', 'violated'):
            track.state = 'approaching'
            track.cross_t = None

        # Preserve confirmed violations
        if track.state == 'violated':
            return 'violated'

        # Track first crossing moment
        if crossed and track.cross_t is None:
            track.cross_t = now

        # ── SAFE PASSAGE — only non-violation case ────────────
        # x consistently increasing = vehicle going right (oncoming lane / right turn)
        # Checked at any point: if true, never a violation regardless of light
        if self._x_net_rightward(track):
            track.state = 'safe_passage'
            return 'safe_passage'

        if track.state == 'safe_passage':
            # x was going right, now it stopped — could be pausing before turn
            # Keep as safe_passage until vehicle retreats and comes back
            return 'safe_passage'

        # ── Light gate + crossing gate ────────────────────────
        if light != 'red' or not crossed:
            return 'approaching'

        # ── Movement check — reject truly stationary vehicles ──
        if not self._has_moved(track):
            return 'pending'

        # ── Grace window — give trajectory time to develop ────
        # Allows _x_net_rightward to accumulate SAFE_PASS_FRAMES before deciding
        if track.cross_t is not None and (now - track.cross_t) < SAFE_PASS_CHECK_SECS:
            return 'pending'

        # ── VIOLATION ─────────────────────────────────────────
        # Crossed stop_x during red, x NOT consistently increasing, vehicle is moving
        track.state = 'violated'
        return 'violated'

    # ── Direction helpers (annotation only) ──────────────────

    def compute_direction(self, prev, curr) -> Tuple[str, str]:
        """Image-coordinate direction from Δx/Δy."""
        dx = curr[0]-prev[0]; dy = curr[1]-prev[1]
        m = MOTION_THRESHOLD
        dir_x = "right" if dx >  m else ("left" if dx < -m else "stationary")
        dir_y = "down"  if dy >  m else ("up"   if dy < -m else "stationary")
        return dir_x, dir_y

    def compute_direction_relative(self, prev, curr) -> Tuple[str, str]:
        """Direction projected onto direction_ref axis (for annotation + LPR metadata)."""
        if not self.direction_ref:
            dx, dy = curr[0]-prev[0], curr[1]-prev[1]
            m = MOTION_THRESHOLD
            return (
                "forward"  if dy >  m else ("backward" if dy < -m else "stationary"),
                "right"    if dx >  m else ("left"     if dx < -m else "stationary"),
            )
        p1, p2 = self.direction_ref
        rx = p2[0]-p1[0]; ry = p2[1]-p1[1]
        length = math.sqrt(rx*rx + ry*ry)
        if length < 1e-9:
            return "stationary", "stationary"
        ux = rx/length; uy = ry/length
        dx = curr[0]-prev[0]; dy = curr[1]-prev[1]
        m = MOTION_THRESHOLD
        dir_along = "forward"  if dx*ux+dy*uy >  m else ("backward" if dx*ux+dy*uy < -m else "stationary")
        dir_perp  = "right"    if dx*uy-dy*ux >  m else ("left"     if dx*uy-dy*ux < -m else "stationary")
        return dir_along, dir_perp


# ══════════════════════════════════════════════════════════════
# MODULE 4  —  Evidence Capture
# ══════════════════════════════════════════════════════════════
class EvidenceCapture:
    """
    • _full.jpg  — annotated full frame (vehicle box + TL = legal proof)
    • _crop.jpg  — tight vehicle crop with minimal padding (LPR input)
    • .mp4       — post-violation clip in context region around vehicle
    """
    CROP_PAD  = 25
    VIDEO_PAD = 80

    def __init__(self, output_base: str, tl_box: Optional[list], frame_w: int, frame_h: int):
        self.output_base = output_base
        self.tl_box      = tl_box
        self.frame_w     = frame_w
        self.frame_h     = frame_h
        os.makedirs(os.path.join(output_base, 'evidences', 'images'), exist_ok=True)
        os.makedirs(os.path.join(output_base, 'evidences', 'videos'), exist_ok=True)

    def save_images(self, frame: np.ndarray, vehicle: VehicleState,
                    light_status: str, abs_img: str, abs_crop: str,
                    abs_context: str, abs_plate: str) -> None:
        x1, y1, x2, y2 = vehicle.bbox
        full = frame.copy()
        cv2.rectangle(full, (x1, y1), (x2, y2), (0, 0, 255), 3)
        lane_lbl = f"L{vehicle.lane_id}" if vehicle.lane_id is not None else "L?"
        dir_lbl  = (f"{vehicle.dir_along[0].upper()}/{vehicle.dir_perp[0].upper()}"
                    if vehicle.dir_along != "unknown" else "?/?")
        cv2.putText(
            full,
            f"#{vehicle.track_id} {vehicle.vehicle_type.upper()} {lane_lbl} [{dir_lbl}]",
            (x1, max(y1-12, 20)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2,
        )
        cv2.putText(full, f"LIGHT: {light_status.upper()}",
                    (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 255), 3)
        if self.tl_box:
            tx1, ty1, tx2, ty2 = map(int, self.tl_box)
            cv2.rectangle(full, (tx1, ty1), (tx2, ty2), (255, 255, 255), 2)
            cv2.putText(full, "SIGNAL", (tx1, max(ty1-8, 16)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.imwrite(abs_img, full)

        # _crop.jpg: tight vehicle crop
        p   = self.CROP_PAD
        cx1 = max(0, x1-p);            cy1 = max(0, y1-p)
        cx2 = min(self.frame_w, x2+p); cy2 = min(self.frame_h, y2+p)
        crop = frame[cy1:cy2, cx1:cx2]
        cv2.imwrite(abs_crop, crop if crop.size > 0 else frame[y1:y2, x1:x2])

        # _context.jpg: union region covering vehicle + traffic light
        CTX_PAD = 40
        if self.tl_box:
            tx1c, ty1c, tx2c, ty2c = map(int, self.tl_box)
            rgn_x1 = max(0, min(x1, tx1c) - CTX_PAD)
            rgn_y1 = max(0, min(y1, ty1c) - CTX_PAD)
            rgn_x2 = min(self.frame_w, max(x2, tx2c) + CTX_PAD)
            rgn_y2 = min(self.frame_h, max(y2, ty2c) + CTX_PAD)
        else:
            rgn_x1 = max(0, x1 - CTX_PAD * 2)
            rgn_y1 = max(0, y1 - CTX_PAD * 2)
            rgn_x2 = min(self.frame_w, x2 + CTX_PAD * 2)
            rgn_y2 = min(self.frame_h, y2 + CTX_PAD * 2)
        ctx = full[rgn_y1:rgn_y2, rgn_x1:rgn_x2].copy()
        if ctx.size > 0:
            cv2.putText(ctx,
                        f"VIOLATION #{vehicle.track_id} — {vehicle.vehicle_type.upper()}",
                        (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2)
            cv2.imwrite(abs_context, ctx)

        # _plate.jpg: bottom 40% of vehicle bbox (plate region), upscaled 2×
        plate_h = max(1, (y2 - y1) * 40 // 100)
        px1 = max(0, x1 - 12)
        py1 = max(0, y2 - plate_h)
        px2 = min(self.frame_w, x2 + 12)
        py2 = min(self.frame_h, y2)
        plate = frame[py1:py2, px1:px2]
        if plate.size > 0:
            plate_up = cv2.resize(
                plate, (plate.shape[1] * 2, plate.shape[0] * 2),
                interpolation=cv2.INTER_CUBIC,
            )
            cv2.imwrite(abs_plate, plate_up)

    def open_video(self, buffer: deque, fps: int, vehicle: VehicleState,
                   abs_vid: str) -> Tuple["cv2.VideoWriter", Tuple[int, int, int, int]]:
        x1, y1, x2, y2 = vehicle.bbox
        p   = self.VIDEO_PAD
        ex1 = max(0, x1-p);             ey1 = max(0, y1-p)
        ex2 = min(self.frame_w, x2+p);  ey2 = min(self.frame_h, y2+p)
        cw  = (ex2-ex1)//2*2; ch = (ey2-ey1)//2*2
        fourcc = cv2.VideoWriter_fourcc(*'avc1')
        writer = cv2.VideoWriter(abs_vid, fourcc, fps, (cw, ch))
        if not writer.isOpened():
            writer = cv2.VideoWriter(abs_vid, cv2.VideoWriter_fourcc(*'mp4v'), fps, (cw, ch))
        for bf in buffer:
            clip = bf[ey1:ey1+ch, ex1:ex1+cw]
            if clip.shape[:2] == (ch, cw):
                writer.write(clip)
        return writer, (ex1, ey1, cw, ch)


# ══════════════════════════════════════════════════════════════
# MODULE 5  —  Violation Reporter
# ══════════════════════════════════════════════════════════════
class ViolationReporter:
    def report(self, track_id: int, vehicle_type: str, light_status: str,
               image_path: str, crop_image_path: str,
               context_image_path: str, plate_image_path: str,
               video_path: str, camera_id: Optional[int]) -> None:
        try:
            r = requests.post(f"{API_BASE}/violations", json={
                "vehicle_id":           int(track_id),
                "vehicle_type":         vehicle_type,
                "light_status":         light_status,
                "image_path":           image_path,
                "crop_image_path":      crop_image_path,
                "context_image_path":   context_image_path,
                "plate_image_path":     plate_image_path,
                "video_path":           video_path,
                "camera_id":            camera_id,
            }, timeout=2.0)
            print(f"📡 VIO#{track_id} → {r.status_code}")
        except Exception as e:
            print(f"❌ Report error: {e}")


# ══════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════
def load_roi_config() -> Tuple:
    """
    JSON schema (data/roi_config.json):
    {
      "stop_line":         [[x1,y1],[x2,y2]],   -- dashed stop threshold (primary)
      "direction_ref":     [[x1,y1],[x2,y2]],   -- lane axis for trajectory analysis
      "lane_polygons":     [[[x,y],...], ...],
      "traffic_light_box": [x1,y1,x2,y2],
      "vehicle_zone":      [x1,y1,x2,y2],
      "roi_x": int, "roi_y": int                -- legacy fallbacks
    }
    """
    stop_line = direction_ref = lane_polygons = None
    tl_box = veh_zone = None
    legacy_roi_x = legacy_roi_y = None

    if os.path.exists(ROI_CONFIG):
        try:
            with open(ROI_CONFIG) as f:
                cfg = json.load(f)
            stop_line     = cfg.get('stop_line')
            direction_ref = cfg.get('direction_ref')
            lane_polygons = cfg.get('lane_polygons')
            tl_box        = cfg.get('traffic_light_box')
            veh_zone      = cfg.get('vehicle_zone')
            legacy_roi_x  = cfg.get('roi_x')
            legacy_roi_y  = cfg.get('roi_y')
        except Exception:
            pass

    if args.stop_line:
        try:
            v = [int(x) for x in args.stop_line.split(',')]
            stop_line = [[v[0], v[1]], [v[2], v[3]]]
        except Exception:
            pass
    elif args.roi_x is not None:
        legacy_roi_x = args.roi_x

    if args.direction_ref:
        try:
            v = [int(x) for x in args.direction_ref.split(',')]
            direction_ref = [[v[0], v[1]], [v[2], v[3]]]
        except Exception:
            pass
    elif args.roi_y is not None:
        legacy_roi_y = args.roi_y

    if args.tl_box:
        try:   tl_box   = [int(v) for v in args.tl_box.split(',')]
        except: pass
    if args.veh_zone:
        try:   veh_zone = [int(v) for v in args.veh_zone.split(',')]
        except: pass

    return (stop_line, direction_ref, lane_polygons,
            tl_box, veh_zone, legacy_roi_x, legacy_roi_y)


def scale_points(pts: list, scale: float) -> list:
    return [[int(p[0]*scale), int(p[1]*scale)] for p in pts]

def scale_polygon_list(polys: list, scale: float) -> list:
    return [scale_points(poly, scale) for poly in polys]

def scale_box(box: list, scale: float) -> list:
    return [int(v*scale) for v in box]


def make_stem(track_id: int) -> str:
    ts = time.strftime('%Y%m%d_%H%M%S')
    ms = int(time.time()*1000) % 1000
    return f"v_{track_id}_{ts}_{ms}"


def draw_dashed_line(img: np.ndarray, p1, p2, color, thickness=2,
                     dash_len=15, gap_len=10) -> None:
    dx = p2[0]-p1[0]; dy = p2[1]-p1[1]
    length = math.sqrt(dx*dx + dy*dy)
    if length < 1:
        return
    nx = dx/length; ny = dy/length
    seg = dash_len + gap_len
    for i in range(int(length/seg) + 1):
        s = i * seg; e = min(s + dash_len, length)
        if s >= length:
            break
        cv2.line(img, (int(p1[0]+nx*s), int(p1[1]+ny*s)),
                      (int(p1[0]+nx*e), int(p1[1]+ny*e)), color, thickness)


def send_frame(frame: np.ndarray) -> None:
    try:
        h, w = frame.shape[:2]
        if w > 1280:
            frame = cv2.resize(frame, (1280, int(h*1280/w)))
        _, enc = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
        requests.post(STREAM_URL, data=enc.tobytes(),
                      headers={'Content-Type': 'image/jpeg'}, timeout=0.1)
    except Exception:
        pass


def send_light(status: str) -> None:
    try:
        requests.post(f"{API_BASE}/set-current-light",
                      json={"status": status}, timeout=0.1)
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ══════════════════════════════════════════════════════════════
def run() -> None:
    (stop_line, direction_ref, lane_polygons,
     tl_box, veh_zone, legacy_roi_x, legacy_roi_y) = load_roi_config()

    print(f"🚀 AI v4 | cam={args.camera_db_id} | "
          f"stop_line={stop_line} dir_ref={direction_ref} "
          f"lanes={len(lane_polygons) if lane_polygons else 0} tl={tl_box}")

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f"❌ Cannot open: {args.video}"); return

    src_w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    src_fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30

    scale    = min(1.0, TARGET_HEIGHT / src_h)
    proc_w   = int(src_w * scale)
    proc_h   = int(src_h * scale)
    proc_fps = min(src_fps, 15)
    skip     = max(1, round(src_fps / proc_fps))
    print(f"📐 {src_w}x{src_h}@{src_fps} → {proc_w}x{proc_h}@{proc_fps} (skip={skip})")

    s_stop_line  = scale_points(stop_line,    scale) if stop_line    else None
    s_dir_ref    = scale_points(direction_ref, scale) if direction_ref else None
    s_lane_polys = scale_polygon_list(lane_polygons, scale) if lane_polygons else []
    s_roi_x      = int(legacy_roi_x * scale) if legacy_roi_x else None
    s_roi_y      = int(legacy_roi_y * scale) if legacy_roi_y else None
    s_tl_box     = scale_box(tl_box,   scale) if tl_box   else None
    s_vz         = scale_box(veh_zone, scale) if veh_zone else None

    v_model = YOLO(VEHICLE_MODEL)
    t_model = YOLO(TRAFFIC_MODEL)

    tol         = max(VIO_TOLERANCE, int(proc_w * 0.015))
    tl          = TrafficLightDetector(t_model, s_tl_box, proc_w, proc_h)
    tl.configure(proc_fps)
    lane_filter = LaneFilter(s_lane_polys)
    checker     = ViolationChecker(s_stop_line, s_dir_ref, tol, s_roi_x, s_roi_y)
    capturer    = EvidenceCapture(OUTPUT_BASE, s_tl_box, proc_w, proc_h)
    reporter    = ViolationReporter()

    # ── Session state ─────────────────────────────────────────
    tracks:       Dict[int, VehicleTrack] = {}   # replaces pos_history
    violated_ids: set                     = set() # prevents duplicate evidence capture
    active_recs:  Dict[int, dict]         = {}   # tid → recording context
    last_light:   Optional[str]           = None
    buffer:       deque                   = deque(maxlen=proc_fps * 2)
    stream_t:     float                   = 0.0
    stream_iv:    float                   = 1.0 / STREAM_FPS

    while cap.isOpened():
        if not all(cap.grab() for _ in range(skip-1)):
            break
        ret, raw = cap.read()
        if not ret:
            break

        frame   = (cv2.resize(raw, (proc_w, proc_h), interpolation=cv2.INTER_AREA)
                   if scale < 1.0 else raw)
        buffer.append(frame.copy())
        display = frame.copy()
        now     = time.time()

        # ── Module 1: Traffic light ────────────────────────────
        light = tl.update(frame)
        if light != last_light:
            send_light(light)
            last_light = light

        # ── Module 2+3: Detection + lane filter + decision engine
        vx1, vy1, vx2, vy2 = (
            (s_vz[0], s_vz[1], s_vz[2], s_vz[3]) if s_vz
            else (0, 0, proc_w, proc_h)
        )
        zone_crop = frame[vy1:vy2, vx1:vx2]

        if zone_crop.size > 0:
            res = v_model.track(zone_crop, persist=True, conf=CONFIDENCE, verbose=False)[0]

            if res.boxes.id is not None:
                for box, tid, cls in zip(
                    res.boxes.xyxy.cpu().numpy(),
                    res.boxes.id.cpu().numpy().astype(int),
                    res.boxes.cls.cpu().numpy().astype(int),
                ):
                    if cls not in VEHICLE_CLASSES:
                        continue

                    x1 = int(box[0])+vx1; y1 = int(box[1])+vy1
                    x2 = int(box[2])+vx1; y2 = int(box[3])+vy1
                    cx, cy = (x1+x2)//2, (y1+y2)//2
                    v_type = VEHICLE_CLASSES[cls]

                    # Lane filter
                    lane_id = lane_filter.classify((cx, cy))
                    if lane_filter.enabled and lane_id is None:
                        continue

                    # Direction (annotation only — uses prev position from track)
                    dir_x = dir_y = dir_along = dir_perp = "unknown"
                    if tid in tracks and tracks[tid].positions:
                        _, p_cx, p_cy = tracks[tid].positions[-1]
                        dir_x, dir_y        = checker.compute_direction((p_cx, p_cy), (cx, cy))
                        dir_along, dir_perp = checker.compute_direction_relative(
                            (p_cx, p_cy), (cx, cy))

                    # Update track — append BEFORE evaluate_track
                    if tid not in tracks:
                        tracks[tid] = VehicleTrack(positions=deque(maxlen=30))
                    track = tracks[tid]
                    track.positions.append((now, cx, cy))

                    # 5-condition decision engine
                    verdict = checker.evaluate_track(track, light)

                    # Handle verdict
                    is_vio = (
                        verdict == 'violated'
                        and tid not in violated_ids
                        and tid not in active_recs
                    )

                    if is_vio:
                        violated_ids.add(tid)
                        stem         = make_stem(tid)
                        rel_img      = f"evidences/images/{stem}_full.jpg"
                        rel_crop     = f"evidences/images/{stem}_crop.jpg"
                        rel_context  = f"evidences/images/{stem}_context.jpg"
                        rel_plate    = f"evidences/images/{stem}_plate.jpg"
                        rel_vid      = f"evidences/videos/{stem}.mp4"
                        vehicle  = VehicleState(
                            track_id=tid, vehicle_type=v_type,
                            bbox=(x1, y1, x2, y2), center=(cx, cy),
                            lane_id=lane_id,
                            direction_x=dir_x, direction_y=dir_y,
                            dir_along=dir_along, dir_perp=dir_perp,
                        )
                        capturer.save_images(
                            frame, vehicle, light,
                            os.path.join(OUTPUT_BASE, rel_img),
                            os.path.join(OUTPUT_BASE, rel_crop),
                            os.path.join(OUTPUT_BASE, rel_context),
                            os.path.join(OUTPUT_BASE, rel_plate),
                        )
                        writer, region = capturer.open_video(
                            buffer, proc_fps, vehicle,
                            os.path.join(OUTPUT_BASE, rel_vid),
                        )
                        active_recs[tid] = {
                            "writer": writer, "count": 0, "crop": region,
                            "v_type": v_type, "cancelled": False,
                            "rel_img": rel_img, "rel_crop": rel_crop,
                            "rel_context": rel_context, "rel_plate": rel_plate,
                            "rel_vid": rel_vid,
                        }
                        print(f"🚨 VIO#{tid} ({v_type}) captured")

                    elif verdict == 'safe_passage' and tid in active_recs:
                        # Right-turn or pre-red parked → cancel pending violation
                        active_recs[tid]["cancelled"] = True
                        active_recs[tid]["writer"].release()
                        del active_recs[tid]
                        violated_ids.discard(tid)
                        print(f"✅ SAFE PASSAGE #{tid} — violation cancelled")

                    # Annotation
                    color = VERDICT_COLOR.get(verdict, (0, 255, 0))
                    lane_lbl  = f"L{lane_id}" if lane_id is not None else "L?"
                    dir_short = (
                        f"{dir_along[0].upper()}{dir_perp[0].upper()}"
                        if dir_along != "unknown" else "?"
                    )
                    vrd_short = verdict[:3].upper()
                    cv2.rectangle(display, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(
                        display,
                        f"{v_type[0].upper()}#{tid} {lane_lbl} {dir_short} [{vrd_short}]",
                        (x1, y1-6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1,
                    )

        # ── Post-violation video recording ─────────────────────
        for tid in list(active_recs.keys()):
            rec = active_recs[tid]
            if rec["cancelled"]:
                del active_recs[tid]
                continue
            ex1, ey1, cw, ch = rec["crop"]
            clip = frame[ey1:ey1+ch, ex1:ex1+cw]
            if clip.shape[:2] == (ch, cw):
                rec["writer"].write(clip)
            rec["count"] += 1
            if rec["count"] >= proc_fps * POST_VIO_SECS:
                rec["writer"].release()
                reporter.report(
                    tid, rec["v_type"], "RED",
                    rec["rel_img"], rec["rel_crop"],
                    rec["rel_context"], rec["rel_plate"],
                    rec["rel_vid"], args.camera_db_id,
                )
                del active_recs[tid]

        # ── ROI overlays ──────────────────────────────────────
        lane_filter.draw(display)

        if s_stop_line:
            draw_dashed_line(display,
                             tuple(s_stop_line[0]), tuple(s_stop_line[1]),
                             (0, 255, 255), 2, 15, 10)
            cv2.putText(display, "STOP",
                        (s_stop_line[0][0]+4, s_stop_line[0][1]-8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        elif s_roi_x:
            draw_dashed_line(display, (s_roi_x, 0), (s_roi_x, proc_h),
                             (0, 255, 255), 2, 15, 10)

        if s_dir_ref:
            p1 = tuple(s_dir_ref[0]); p2 = tuple(s_dir_ref[1])
            cv2.arrowedLine(display, p1, p2, (0, 128, 255), 2, tipLength=0.2)
            cv2.putText(display, "LANE DIR", (p1[0]+4, p1[1]-8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 128, 255), 1)
        elif s_roi_y:
            cv2.line(display, (0, s_roi_y), (proc_w, s_roi_y), (0, 255, 0), 2)

        if s_tl_box:
            cv2.rectangle(display,
                          (s_tl_box[0], s_tl_box[1]),
                          (s_tl_box[2], s_tl_box[3]), (255, 0, 0), 2)
        if s_vz:
            cv2.rectangle(display, (s_vz[0], s_vz[1]), (s_vz[2], s_vz[3]),
                          (180, 180, 180), 1)

        # Light status HUD
        hud_color = {'red': (0,0,255), 'green': (0,200,0), 'yellow': (0,200,200)}.get(light, (180,180,180))
        cv2.putText(display, f"LIGHT: {light.upper()}", (12, 36),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, hud_color, 3)

        t_now = time.time()
        if t_now - stream_t >= stream_iv:
            send_frame(display)
            stream_t = t_now

    cap.release()
    for rec in active_recs.values():
        rec["writer"].release()


if __name__ == '__main__':
    run()
