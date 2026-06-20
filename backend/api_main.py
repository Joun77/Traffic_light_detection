import os
import json
import shutil
import subprocess
import cv2
import asyncio
import numpy as np
import signal
import time
from datetime import datetime, date
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Request, Response, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional

from fastapi.staticfiles import StaticFiles
import psycopg2
from psycopg2.extras import RealDictCursor
from starlette.middleware.base import BaseHTTPMiddleware

# --- Custom Middleware for CORS on Static Files ---
class StaticCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

app = FastAPI(title="Traffic Monitoring AI API")

# Add Middlewares
app.add_middleware(StaticCORSMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "../data/uploads")
EVIDENCE_DIR = os.path.join(BASE_DIR, "../outputs/evidences")
CONFIG_FILE = os.path.join(BASE_DIR, "../data/roi_config.json")
DATA_DIR = os.path.join(BASE_DIR, "../data")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EVIDENCE_DIR, exist_ok=True)
os.makedirs(os.path.join(EVIDENCE_DIR, "images"), exist_ok=True)
os.makedirs(os.path.join(EVIDENCE_DIR, "videos"), exist_ok=True)

app.mount("/evidences", StaticFiles(directory=EVIDENCE_DIR), name="evidences")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/static-data", StaticFiles(directory=DATA_DIR), name="static-data")

# --- 🚀 Real-time Event System (SSE) ---
class Notifier:
    def __init__(self):
        self.connections = []

    async def subscribe(self):
        queue = asyncio.Queue()
        self.connections.append(queue)
        return queue

    def unsubscribe(self, queue):
        if queue in self.connections:
            self.connections.remove(queue)

    async def notify(self, data):
        for queue in self.connections:
            await queue.put(data)

notifier = Notifier()

# --- 🧠 Global State ---
latest_frame = None
latest_light_status = "unknown"
latest_video = None
ai_process = None

class ROIConfig(BaseModel):
    roi_y: Optional[int] = None
    roi_x: Optional[int] = None
    stop_line: Optional[List[List[int]]] = None          # [[x1,y1],[x2,y2]] from Y tool
    roi_x_line: Optional[List[List[int]]] = None         # [[x1,y1],[x2,y2]] from X tool
    lane_polygons: Optional[List[List[List[int]]]] = None # [[[x,y],...], ...] from LANE tool
    traffic_light_box: Optional[List[int]] = None
    vehicle_zone: Optional[List[int]] = None
    scale: Optional[float] = 1.0
    video_path: Optional[str] = None
    camera_id: Optional[int] = None
    has_reference: Optional[bool] = None # Added to prevent 422 validation error

class ViolationReport(BaseModel):
    vehicle_id: int
    vehicle_type: str
    light_status: str
    image_path: str
    crop_image_path: Optional[str] = None     # tight vehicle crop for LPR
    context_image_path: Optional[str] = None  # vehicle + traffic light merged region
    plate_image_path: Optional[str] = None    # license plate zone, 2× upscaled
    video_path: str
    camera_id: Optional[int] = None

class CameraUpdate(BaseModel):
    location_name: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    province: Optional[str] = None
    is_active: Optional[bool] = None

# --- 🚦 Light Status Endpoint ---

@app.post("/set-current-light")
async def set_current_light(data: dict):
    global latest_light_status
    status = data.get("status", "unknown")
    latest_light_status = status
    await notifier.notify({"type": "light_status", "data": status})
    return {"status": "success", "color": status}

@app.get("/light-status")
async def get_light_status():
    return {"status": latest_light_status}

# --- 📊 Database & Violation Endpoints ---

import logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("TrafficAPI")

@app.post("/violations")
async def add_violation(report: ViolationReport):
    try:
        logger.info(f"💾 Saving violation: Vehicle {report.vehicle_id} from Camera {report.camera_id}")
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            INSERT INTO violations
                (vehicle_id, vehicle_type, light_status, image_path, crop_image_path,
                 context_image_path, plate_image_path, video_path, camera_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
        """, (
            report.vehicle_id, report.vehicle_type, report.light_status,
            report.image_path, report.crop_image_path,
            report.context_image_path, report.plate_image_path,
            report.video_path, report.camera_id,
        ))
        new_row = cur.fetchone()
        conn.commit()
        
        # 🔗 Enrichment: Get full details for the live notification
        cur.execute("""
            SELECT v.*, c.location_name, c.village, c.district, c.province 
            FROM violations v
            LEFT JOIN cameras c ON v.camera_id = c.id
            WHERE v.id = %s
        """, (new_row['id'],))
        enriched_v = cur.fetchone()
        
        cur.close(); conn.close()

        violation_data = dict(enriched_v)
        await notifier.notify({"type": "new_violation", "data": violation_data})
        return {"status": "success", "data": violation_data}
    except Exception as e:
        logger.error(f"❌ Error saving violation: {str(e)}")
        return {"status": "error", "message": str(e)}


@app.get("/violations")
async def get_violations(limit: int = 100, camera_id: Optional[int] = None):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'violations' AND column_name = 'camera_id'")
        has_cam_id = cur.fetchone()

        if has_cam_id:
            where = f"WHERE v.camera_id = {camera_id}" if camera_id is not None else ""
            query = f"""
                SELECT v.*, c.location_name, c.village, c.district, c.province
                FROM violations v
                LEFT JOIN cameras c ON v.camera_id = c.id
                {where}
                ORDER BY v.time_stamp DESC LIMIT %s
            """
        else:
            query = "SELECT * FROM violations ORDER BY time_stamp DESC LIMIT %s"

        cur.execute(query, (limit,))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"❌ Get violations error: {str(e)}")
        return {"error": str(e)}

@app.get("/violation-summary")
async def get_violation_summary(period: str = "all"):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        where_clause = ""
        if period == "day": where_clause = "WHERE time_stamp >= CURRENT_DATE"
        elif period == "week": where_clause = "WHERE time_stamp >= CURRENT_DATE - INTERVAL '7 days'"
        elif period == "month": where_clause = "WHERE time_stamp >= CURRENT_DATE - INTERVAL '30 days'"

        cur.execute(f"SELECT COUNT(*) as total FROM violations {where_clause}")
        total = cur.fetchone()['total']
        cur.execute(f"SELECT vehicle_type, COUNT(*) as count FROM violations {where_clause} GROUP BY vehicle_type")
        by_type = [dict(r) for r in cur.fetchall()]
        cur.execute(f"SELECT TO_CHAR(time_stamp, 'YYYY-MM-DD') as date, COUNT(*) as count FROM violations {where_clause} GROUP BY date ORDER BY date ASC")
        daily_stats = [dict(r) for r in cur.fetchall()]

        cur.close(); conn.close()
        return {"total_violations": total, "by_type": by_type, "daily_stats": daily_stats}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/violations/{violation_id}")
async def delete_violation(violation_id: int):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT image_path, video_path FROM violations WHERE id = %s", (violation_id,))
        row = cur.fetchone()
        if row:
            for key in ['image_path', 'video_path']:
                if row[key]:
                    abs_path = os.path.join(BASE_DIR, "..", "outputs", row[key])
                    if os.path.exists(abs_path): os.remove(abs_path)
            cur.execute("DELETE FROM violations WHERE id = %s", (violation_id,))
            conn.commit()
        cur.close(); conn.close()
        return {"status": "success"}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.delete("/violations")
async def delete_all_violations():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        cur.execute("DELETE FROM violations"); conn.commit()
        cur.close(); conn.close()
        for sub in ['images', 'videos']:
            folder = os.path.join(EVIDENCE_DIR, sub)
            if os.path.exists(folder):
                for filename in os.listdir(folder):
                    if filename.startswith("v_"): os.remove(os.path.join(folder, filename))
        return {"status": "success"}
    except Exception as e: return {"status": "error", "message": str(e)}

# --- 📷 CCTV Camera Endpoints ---

def convert_video_task(camera_db_id: int, temp_path: str, output_path: str, output_filename: str):
    try:
        try:
            from vidstab import VidStab
            stabilizer = VidStab()
            stabilizer.stabilize(
                input_path=temp_path,
                output_path=output_path,
                smoothing_window=30,
                output_fourcc='mp4v',
            )
            logger.info(f"✅ Video stabilized: {output_filename}")
        except Exception as stab_err:
            logger.warning(f"⚠️ Stabilization failed, converting without it: {stab_err}")
            cap = cv2.VideoCapture(temp_path)
            w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            out = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*'avc1'), fps, (w, h))
            if not out.isOpened(): out = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret: break
                out.write(frame)
            cap.release(); out.release()
    finally:
        if os.path.exists(temp_path): os.remove(temp_path)
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            cur = conn.cursor()
            cur.execute("UPDATE cameras SET rtsp_url = %s WHERE id = %s", (f"uploads/{output_filename}", camera_db_id))
            conn.commit(); cur.close(); conn.close()
        except Exception as db_err: logger.error(f"DB update error: {db_err}")

@app.get("/cameras")
async def get_cameras():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM cameras ORDER BY id ASC")
        rows = cur.fetchall(); cur.close(); conn.close()
        return [dict(row) for row in rows]
    except Exception as e: return {"error": str(e)}

@app.get("/cameras/{camera_db_id}")
async def get_camera(camera_db_id: int):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM cameras WHERE id = %s", (camera_db_id,))
        row = cur.fetchone(); cur.close(); conn.close()
        if not row: return {"error": "Camera not found"}
        return dict(row)
    except Exception as e: return {"error": str(e)}

@app.post("/cameras/{camera_db_id}/upload-video")
async def upload_camera_video(camera_db_id: int, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    try:
        temp_path = os.path.join(UPLOAD_DIR, f"temp_{camera_db_id}_{file.filename}")
        with open(temp_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        output_filename = f"cam_{camera_db_id}_{int(time.time())}.mp4"
        output_path = os.path.join(UPLOAD_DIR, output_filename)
        background_tasks.add_task(convert_video_task, camera_db_id, temp_path, output_path, output_filename)
        return {"status": "processing"}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.delete("/cameras/{camera_db_id}/video")
async def delete_camera_video(camera_db_id: int):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT rtsp_url FROM cameras WHERE id = %s", (camera_db_id,))
        row = cur.fetchone()
        if row and row['rtsp_url']:
            abs_p = os.path.join(BASE_DIR, "..", row['rtsp_url'])
            if os.path.exists(abs_p): os.remove(abs_p)
            cur.execute("UPDATE cameras SET rtsp_url = NULL WHERE id = %s", (camera_db_id,))
            conn.commit()
        cur.close(); conn.close()
        return {"status": "success"}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.put("/cameras/{camera_db_id}")
async def update_camera(camera_db_id: int, cam_data: CameraUpdate):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        fields, params = [], []
        if cam_data.location_name: fields.append("location_name = %s"); params.append(cam_data.location_name)
        if cam_data.village: fields.append("village = %s"); params.append(cam_data.village)
        if cam_data.district: fields.append("district = %s"); params.append(cam_data.district)
        if cam_data.province: fields.append("province = %s"); params.append(cam_data.province)
        if cam_data.is_active is not None: fields.append("is_active = %s"); params.append(cam_data.is_active)
        if not fields: return {"status": "no_change"}
        params.append(camera_db_id)
        cur.execute(f"UPDATE cameras SET {', '.join(fields)} WHERE id = %s", tuple(params))
        conn.commit(); cur.close(); conn.close()
        return {"status": "success"}
    except Exception as e: return {"status": "error", "message": str(e)}

# --- 🎥 System Routes ---

@app.get("/")
def read_root(): return {"status": "Online"}

@app.get("/events")
async def event_stream(request: Request):
    queue = await notifier.subscribe()
    async def stream():
        try:
            while True:
                if await request.is_disconnected(): break
                data = await queue.get()
                yield f"data: {json.dumps(data, default=str)}\n\n"
        except: pass
        finally: notifier.unsubscribe(queue)
    return StreamingResponse(stream(), media_type="text/event-stream")

@app.post("/update-frame")
async def update_frame(request: Request):
    global latest_frame
    try:
        contents = await request.body()
        img = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
        if img is not None: latest_frame = img
        return {"status": "ok"}
    except: return {"status": "error"}

async def frame_generator():
    global latest_frame
    while True:
        if latest_frame is not None:
            ret, buffer = cv2.imencode('.jpg', latest_frame)
            if ret: yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        else:
            black = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(black, "Waiting for Feed...", (180, 240), 1, 1.5, (255,255,255), 2)
            _, buffer = cv2.imencode('.jpg', black)
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        await asyncio.sleep(0.04)

@app.get("/video-feed")
async def video_feed():
    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.post("/set-roi")
async def set_roi(config: ROIConfig):
    with open(CONFIG_FILE, "w") as f: json.dump(config.model_dump(), f, indent=2)
    return {"status": "success"}

@app.post("/set-roi-reference")
async def set_roi_reference(file: UploadFile = File(...)):
    try:
        ref_path = os.path.join(DATA_DIR, "roi_reference.jpg")
        with open(ref_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        return {"status": "success", "url": "/static-data/roi_reference.jpg"}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.get("/get-roi")
async def get_roi():
    ref_exists = os.path.exists(os.path.join(DATA_DIR, "roi_reference.jpg"))
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f: 
            data = json.load(f)
            data["has_reference"] = ref_exists
            return data
    return {"roi_y": None, "roi_x": None, "traffic_light_box": None, "vehicle_zone": None, "scale": 1.0, "has_reference": ref_exists}

@app.post("/start-detection")
async def start_detection(config: ROIConfig):
    global ai_process, latest_frame
    if ai_process is not None: return {"status": "error"}
    latest_frame = None
    video_to_use = None
    
    if config.video_path:
        if config.video_path.startswith("uploads/"):
            video_to_use = os.path.join(UPLOAD_DIR, config.video_path.replace("uploads/", ""))
        else: video_to_use = os.path.join(BASE_DIR, "..", config.video_path)
    
    if not video_to_use or not os.path.exists(video_to_use):
        return {"status": "error", "message": "Video not found"}

    cmd = ["python3", "vehicle_detection_main.py", "--video", video_to_use]
    if config.camera_id: cmd.extend(["--camera_db_id", str(config.camera_id)])
    if config.roi_y is not None: cmd.extend(["--roi_y", str(config.roi_y)])
    if config.roi_x is not None: cmd.extend(["--roi_x", str(config.roi_x)])
    if config.traffic_light_box: cmd.extend(["--tl_box", ",".join(map(str, config.traffic_light_box))])
    if config.vehicle_zone: cmd.extend(["--veh_zone", ",".join(map(str, config.vehicle_zone))])
    
    ai_process = subprocess.Popen(cmd)
    return {"status": "success"}

@app.post("/stop-detection")
async def stop_detection():
    global ai_process, latest_frame
    if ai_process:
        ai_process.terminate()
        ai_process = None
    latest_frame = None
    return {"status": "stopped"}

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "database": os.getenv("DB_NAME", "traffic_monitoring"),
    "user":     os.getenv("DB_USER", "joun"),
    "password": os.getenv("DB_PASS", "traffic_pass"),
    "port":     os.getenv("DB_PORT", "5432")
}

@app.on_event("startup")
async def run_migrations():
    """Add new image columns to violations table if they don't exist yet."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violations' AND column_name='crop_image_path') THEN
                    ALTER TABLE violations ADD COLUMN crop_image_path TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violations' AND column_name='context_image_path') THEN
                    ALTER TABLE violations ADD COLUMN context_image_path TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violations' AND column_name='plate_image_path') THEN
                    ALTER TABLE violations ADD COLUMN plate_image_path TEXT;
                END IF;
            END
            $$;
        """)
        conn.commit()
        cur.close()
        conn.close()
        logger.info("✅ DB migration: image columns ready")
    except Exception as e:
        logger.warning(f"⚠️ Migration skipped (DB may not be ready): {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
