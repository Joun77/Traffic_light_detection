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

app = FastAPI(title="Traffic Monitoring AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
CONFIG_FILE = "roi_config.json"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Global variables for state management
latest_frame = None
ai_process = None # เก็บ process ของ AI

class ROIConfig(BaseModel):
    roi_y: Optional[int] = None
    roi_x: Optional[int] = None
    traffic_light_box: Optional[List[int]] = None
    vehicle_zone: Optional[List[int]] = None
    scale: Optional[float] = 1.0

@app.get("/")
def read_root():
    return {"status": "Online", "process_running": ai_process is not None}

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
