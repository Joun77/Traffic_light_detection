import psycopg2
import time
import os

def init_database():
    print("--- ກຳລັງກຽມລະບົບຖານຂໍ້ມູນ ---")
    retries = 5
    
    db_host = os.getenv("DB_HOST", "localhost")
    db_name = os.getenv("DB_NAME", "traffic_monitoring")
    db_user = os.getenv("DB_USER", "joun")
    db_pass = os.getenv("DB_PASS", "traffic_pass")
    db_port = os.getenv("DB_PORT", "5432")

    while retries > 0:
        try:
            # ເຊື່ອມຕໍ່ຖານຂໍ້ມູນ
            conn = psycopg2.connect(
                host=db_host,
                database=db_name,
                user=db_user,
                password=db_pass,
                port=db_port
            )
            cur = conn.cursor()

            # ສ້າງຕາຕະລາງ cameras (ກ້ອງວົງຈອນປິດຕາມສະຖານທີ່)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS cameras (
                    id SERIAL PRIMARY KEY,
                    camera_id VARCHAR(50) UNIQUE,
                    location_name VARCHAR(255),
                    village VARCHAR(100),
                    district VARCHAR(100),
                    province VARCHAR(100),
                    is_active BOOLEAN DEFAULT TRUE,
                    rtsp_url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # ສ້າງຕาຕະລາງ violations ພ້ອມລິ້ງກັບ cameras
            cur.execute("""
                CREATE TABLE IF NOT EXISTS violations (
                    id SERIAL PRIMARY KEY,
                    camera_id INTEGER REFERENCES cameras(id) ON DELETE SET NULL,
                    vehicle_id INTEGER,
                    vehicle_type VARCHAR(50),
                    time_stamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    light_status VARCHAR(20),
                    image_path TEXT,
                    video_path TEXT
                );
            """)

            # 🛠️ Migrations: ເພີ່ມຄໍລຳນ໌ທີ່ອາດຈະຍັງບໍ່ມີໃນຕາຕະລາງເກົ່າ
            cur.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violations' AND column_name='camera_id') THEN
                        ALTER TABLE violations ADD COLUMN camera_id INTEGER REFERENCES cameras(id) ON DELETE SET NULL;
                    END IF;
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

            # ເພີ່ມຂໍ້ມູນຕົວຢ່າງກ້ອງ (ຖ້າຍັງບໍ່ມີ)
            cur.execute("SELECT COUNT(*) FROM cameras")
            if cur.fetchone()[0] == 0:
                sample_cameras = [
                    ('CAM-001', 'ສີ່ແຍກປະຕູໄຊ', 'ວຽງຈັນ', 'ຈັນທະບູລີ', 'ນະຄອນຫຼວງວຽງຈັນ', True),
                    ('CAM-002', 'ສີ່ແຍກທາດຫຼວງ', 'ທາດຫຼວງ', 'ໄຊເສດຖາ', 'ນະຄອນຫຼວງວຽງຈັນ', True),
                    ('CAM-003', 'ສາມແຍກດົງໂດກ', 'ດົງໂດກ', 'ໄຊທານີ', 'ນະຄອນຫຼວງວຽງຈັນ', False),
                ]
                for cam in sample_cameras:
                    cur.execute("""
                        INSERT INTO cameras (camera_id, location_name, village, district, province, is_active)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, cam)
            
            conn.commit()
            print("✅ ກຽມຕາຕະລາງ violations ແລະ cameras ສຳເລັດ!")
            
            cur.close()
            conn.close()
            break
        except Exception as e:
            print(f"⌛ ກຳລັງລໍຖ້າຖານຂໍ້ມູນພ້ອມໃຊ້ງານ... ({retries})")
            time.sleep(3)
            retries -= 1
            if retries == 0:
                print(f"❌ ບໍ່ສາມາດເຊື່ອມຕໍ່ຖານຂໍ້ມູນໄດ້: {e}")

if __name__ == "__main__":
    init_database()
