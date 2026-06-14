import os
import json
import shutil
import subprocess
import cv2
import asyncio
import numpy as np
import signal
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

# Mount static files to serve evidence images
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

@app.get("/events")
async def event_stream(request: Request):
    queue = await notifier.subscribe()
    async def stream():
        try:
            while True:
                if await request.is_disconnected():
                    break
                data = await queue.get()
                yield f"data: {json.dumps(data)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            notifier.unsubscribe(queue)

    return StreamingResponse(stream(), media_type="text/event-stream")

# Global variables for state management
latest_frame = None
ai_process = None # เก็บ process ของ AI

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

@app.get("/")
def read_root():
    return {"status": "Online", "process_running": ai_process is not None}

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

        # แจ้งเตือนหน้าเว็บทันทีผ่าน SSE
        await notifier.notify({"type": "new_violation", "data": new_violation})
        return {"status": "success", "data": new_violation}
    except Exception as e:
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
        return rows
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
        
        # กรองตามช่วงเวลา
        where_clause = ""
        if period == "day":
            where_clause = "WHERE time_stamp >= CURRENT_DATE"
        elif period == "week":
            where_clause = "WHERE time_stamp >= CURRENT_DATE - INTERVAL '7 days'"
        elif period == "month":
            where_clause = "WHERE time_stamp >= CURRENT_DATE - INTERVAL '30 days'"

        # 1. จำนวนรวม
        cur.execute(f"SELECT COUNT(*) as total FROM violations {where_clause}")
        total = cur.fetchone()['total']

        # 2. แยกตามประเภทรถ
        cur.execute(f"SELECT vehicle_type, COUNT(*) as count FROM violations {where_clause} GROUP BY vehicle_type")
        by_type = cur.fetchall()

        # 3. ข้อมูลรายวัน (สำหรับทำกราฟ)
        cur.execute(f"""
            SELECT TO_CHAR(time_stamp, 'YYYY-MM-DD') as date, COUNT(*) as count 
            FROM violations 
            {where_clause}
            GROUP BY date 
            ORDER BY date ASC
        """)
        daily_stats = cur.fetchall()

        cur.close()
        conn.close()
        
        return {
            "total_violations": total,
            "by_type": by_type,
            "daily_stats": daily_stats
        }
    except Exception as e:
        return {"error": str(e)}

@app.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"message": "Upload successful", "filename": file.filename}

@app.post("/set-roi")
async def set_roi(config: ROIConfig):
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(config.dict(), f, indent=2)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- 🎥 Video Streaming ---

@app.post("/update-frame")
async def update_frame(request: Request):
    global latest_frame
    try:
        contents = await request.body()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            latest_frame = img
        return {"status": "ok"}
    except:
        return {"status": "error"}

async def frame_generator():
    global latest_frame
    while True:
        if latest_frame is not None:
            ret, buffer = cv2.imencode('.jpg', latest_frame)
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        else:
            # ส่งภาพดำหลอกๆ ไปก่อนถ้ายังไม่มีเฟรม
            black_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(black_frame, "Waiting for AI Feed...", (150, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255,255,255), 2)
            _, buffer = cv2.imencode('.jpg', black_frame)
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        await asyncio.sleep(0.05)

@app.get("/video-feed")
async def video_feed():
    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

# --- 🤖 AI Process Control ---

@app.post("/start-detection")
async def start_detection():
    global ai_process, latest_frame
    if ai_process is not None:
        return {"status": "error", "message": "AI is already running"}
    
    latest_frame = None # ล้างภาพเก่า
    # รัน AI และเก็บ Process ไว้
    ai_process = subprocess.Popen(["python3", "vehicle_detection_main.py"])
    print(f"🚀 AI Process started with PID: {ai_process.pid}")
    return {"status": "success", "message": "AI Started"}

@app.post("/stop-detection")
async def stop_detection():
    global ai_process, latest_frame
    if ai_process is None:
        return {"status": "error", "message": "No AI process running"}
    
    # สั่งหยุด Process
    ai_process.terminate()
    try:
        ai_process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        ai_process.kill()
    
    ai_process = None
    latest_frame = None
    print("🛑 AI Process stopped")
    return {"status": "success", "message": "AI Stopped"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
