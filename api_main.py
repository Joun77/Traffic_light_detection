import os
import json
import shutil
import subprocess
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Traffic Monitoring AI API")

# --- 🔓 ตั้งค่า CORS เพื่อให้ React (ต่าง Port) คุยกับ Python ได้ ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # ในโปรดักชั่นควรเจาะจงเฉพาะ URL ของ React
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 📁 เตรียมโฟลเดอร์ ---
UPLOAD_DIR = "uploads"
CONFIG_FILE = "roi_config.json"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- 📝 Data Model สำหรับรับค่า ROI จาก React ---
class ROIConfig(BaseModel):
    roi_y: Optional[int] = None
    roi_x: Optional[int] = None
    traffic_light_box: Optional[List[int]] = None
    vehicle_zone: Optional[List[int]] = None
    scale: Optional[float] = 1.0

# --- 🚀 Endpoints ---

@app.get("/")
def read_root():
    return {"status": "Online", "message": "Traffic AI API is ready"}

@app.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """รับไฟล์วิดีโอจาก React และเซฟลงเครื่อง"""
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # อัปเดตไฟล์วิดีโอที่จะใช้ในโค้ดหลัก (Optional)
    # เราอาจจะเก็บ Path ไว้ใน Session หรือ Config ก็ได้
    return {"message": "Upload successful", "filename": file.filename, "path": file_path}

@app.post("/set-roi")
async def set_roi(config: ROIConfig):
    """รับพิกัดจาก React มาบันทึกลงไฟล์ json"""
    try:
        # บันทึกทับไฟล์ roi_config.json
        with open(CONFIG_FILE, "w") as f:
            json.dump(config.dict(), f, indent=2)
        return {"status": "success", "message": "ROI configuration saved"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/get-roi")
async def get_roi():
    """ส่งค่า Config ปัจจุบันให้หน้าเว็บ (เพื่อวาดเส้นตามเดิม)"""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            data = json.load(f)
        return data
    return {"message": "No config found"}

def run_ai_script(video_name: str):
    """ฟังก์ชันรัน AI เป็นเบื้องหลัง"""
    # สั่งรัน python3 vehicle_detection_main.py
    # ในสภาวะใช้งานจริง อาจจะใช้ดึง Path วิดีโอจาก Database
    subprocess.run(["python3", "vehicle_detection_main.py"])

@app.post("/start-detection")
async def start_detection(background_tasks: BackgroundTasks, video_name: str = "IMG_9582.MOV"):
    """สั่งให้ AI เริ่มทำงาน"""
    background_tasks.add_task(run_ai_script, video_name)
    return {"status": "processing", "message": "AI Detection started in background"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
