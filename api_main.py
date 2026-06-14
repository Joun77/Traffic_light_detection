import os
import json
import shutil
import subprocess
import cv2
import asyncio
import numpy as np
import signal
from datetime import datetime, date
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional

from fastapi.staticfiles import StaticFiles
import psycopg2
from psycopg2.extras import RealDictCursor

app = FastAPI(title="Traffic Monitoring AI API")

# Database Config
DB_CONFIG = {
    "host": "localhost",
    "database": "traffic_monitoring",
    "user": "joun",
    "password": "traffic_pass",
    "port": "5432"
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
EVIDENCE_DIR = "evidences"
CONFIG_FILE = "roi_config.json"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EVIDENCE_DIR, exist_ok=True)

app.mount("/evidences", StaticFiles(directory=EVIDENCE_DIR), name="evidences")

# --- 🚀 Real-time Event System (SSE) ---
class Notifier:
    def __init__(self):
        self.connections = []

    async def subscribe(self):
        queue = asyncio.Queue()
        self.connections.append(queue)
        return queue

    def unsubscribe(self, queue):
        self.connections.remove(queue)

    async def notify(self, data):
        for queue in self.connections:
            await queue.put(data)

notifier = Notifier()

# --- 🧠 Global State ---
latest_frame = None
latest_light_status = "unknown"
latest_video = "IMG_9582.MOV"
ai_process = None

class ROIConfig(BaseModel):
    roi_y: Optional[int] = None
    roi_x: Optional[int] = None
    traffic_light_box: Optional[List[int]] = None
    vehicle_zone: Optional[List[int]] = None
    scale: Optional[float] = 1.0

class ViolationReport(BaseModel):
    vehicle_id: int
    vehicle_type: str
    light_status: str
    image_path: str
    video_path: str

# --- 🚦 Light Status Endpoint ---

@app.post("/set-current-light")
async def set_current_light(data: dict):
    global latest_light_status
    status = data.get("status", "unknown")
    latest_light_status = status
    print(f"🚦 [BACKEND] Received Light Status: {status}")
    await notifier.notify({"type": "light_status", "data": status})
    return {"status": "success", "color": status}

@app.get("/light-status")
async def get_light_status():
    return {"status": latest_light_status}

# --- 📊 Database & Violation Endpoints ---

@app.post("/violations")
async def add_violation(report: ViolationReport):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            INSERT INTO violations (vehicle_id, vehicle_type, light_status, image_path, video_path)
            VALUES (%s, %s, %s, %s, %s) RETURNING *
        """, (report.vehicle_id, report.vehicle_type, report.light_status, report.image_path, report.video_path))
        new_violation = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        violation_data = dict(new_violation)
        await notifier.notify({"type": "new_violation", "data": violation_data})
        return {"status": "success", "data": violation_data}
    except Exception as e:
        print(f"❌ DB Error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/violations")
async def get_violations(limit: int = 10):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM violations ORDER BY time_stamp DESC LIMIT %s", (limit,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        return {"error": str(e)}

@app.get("/violation-stats")
async def get_violation_stats():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM violations")
        count = cur.fetchone()[0]
        cur.close()
        conn.close()
        return {"total_violations": count}
    except Exception as e:
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

        cur.execute(f"""
            SELECT TO_CHAR(time_stamp, 'YYYY-MM-DD') as date, COUNT(*) as count 
            FROM violations {where_clause} GROUP BY date ORDER BY date ASC
        """)
        daily_stats = [dict(r) for r in cur.fetchall()]

        cur.close(); conn.close()
        return {"total_violations": total, "by_type": by_type, "daily_stats": daily_stats}
    except Exception as e:
        print(f"❌ Summary Error: {e}")
        return {"error": str(e)}

# --- 🎥 System Routes ---

@app.get("/")
def read_root():
    return {"status": "Online", "ai_running": ai_process is not None, "light": latest_light_status}

@app.get("/events")
async def event_stream(request: Request):
    queue = await notifier.subscribe()
    async def stream():
        try:
            while True:
                if await request.is_disconnected(): break
                data = await queue.get()
                # 🛠️ Robust JSON Serialization for SSE
                try:
                    json_data = json.dumps(data, default=str)
                    yield f"data: {json_data}\n\n"
                except Exception as e:
                    print(f"❌ SSE Error: {e}")
        except asyncio.CancelledError: pass
        finally: notifier.unsubscribe(queue)
    return StreamingResponse(stream(), media_type="text/event-stream")

@app.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    global latest_video
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    latest_video = file_path
    return {"message": "Upload successful", "filename": file.filename}

@app.post("/set-roi")
async def set_roi(config: ROIConfig):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config.dict(), f, indent=2)
    return {"status": "success"}

@app.get("/get-roi")
async def get_roi():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f: return json.load(f)
    return {"roi_y": None, "roi_x": None, "traffic_light_box": None, "vehicle_zone": None, "scale": 1.0}

@app.post("/update-frame")
async def update_frame(request: Request):
    global latest_frame
    try:
        contents = await request.body()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None: latest_frame = img
        return {"status": "ok"}
    except: return {"status": "error"}

async def frame_generator():
    global latest_frame
    while True:
        if latest_frame is not None:
            ret, buffer = cv2.imencode('.jpg', latest_frame)
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        else:
            black_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(black_frame, "Waiting for AI Feed...", (150, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255,255,255), 2)
            _, buffer = cv2.imencode('.jpg', black_frame)
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        await asyncio.sleep(0.04)

@app.get("/video-feed")
async def video_feed():
    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.post("/start-detection")
async def start_detection(config: Optional[ROIConfig] = None):
    global ai_process, latest_frame, latest_video
    if ai_process is not None: return {"status": "error", "message": "AI already running"}
    latest_frame = None
    cmd = ["python3", "vehicle_detection_main.py", "--video", latest_video]
    if config:
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
