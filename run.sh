#!/bin/bash
# run.sh — สคริปต์รัน vehicle detection พร้อม env ที่ถูกต้อง
export PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python
cd "$(dirname "$0")/backend"
source ../venv/bin/activate
python vehicle_detection_main.py ${1:-imshow}
