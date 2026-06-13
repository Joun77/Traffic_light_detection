import psycopg2
import time

def init_database():
    print("--- กำลังเตรียมระบบฐานข้อมูล ---")
    retries = 5
    while retries > 0:
        try:
            # เชื่อมต่อฐานข้อมูล (Local Docker)
            conn = psycopg2.connect(
                host="localhost",
                database="traffic_monitoring",
                user="joun",
                password="traffic_pass",
                port="5432"
            )
            cur = conn.cursor()

            # สร้างตาราง violations
            # id: ลำดับรายการ
            # vehicle_id: ID จาก YOLO Tracker
            # vehicle_type: car, motorcycle, etc.
            # time_stamp: วันเวลาที่เกิดเหตุ
            # light_status: สถานะไฟจราจรตอนนั้น (ควรจะเป็น RED)
            # image_path: ที่เก็บไฟล์รูปหลักฐาน
            # video_path: ที่เก็บไฟล์วิดีโอหลักฐาน
            cur.execute("""
                CREATE TABLE IF NOT EXISTS violations (
                    id SERIAL PRIMARY KEY,
                    vehicle_id INTEGER,
                    vehicle_type VARCHAR(50),
                    time_stamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    light_status VARCHAR(20),
                    image_path TEXT,
                    video_path TEXT
                );
            """)
            
            conn.commit()
            print("✅ สร้างตาราง violations สำเร็จ!")
            
            cur.close()
            conn.close()
            break
        except Exception as e:
            print(f"⌛ กำลังรอฐานข้อมูลพร้อมใช้งาน... ({retries})")
            time.sleep(3)
            retries -= 1
            if retries == 0:
                print(f"❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้: {e}")

if __name__ == "__main__":
    init_database()
