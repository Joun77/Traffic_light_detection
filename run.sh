#!/bin/bash
# run.sh — สคริปต์รัน vehicle detection พร้อม env ที่ถูกต้อง
export PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python
cd "$(dirname "$0")/backend"
source ../venv/bin/activate
if [ -z "$1" ]; then
    echo "⚠️ Usage: bash run.sh <path_to_video.mp4> [other options]"
    echo "Example: bash run.sh ../test_codec.mp4"
    exit 1
fi

if [[ "$1" == --* ]]; then
    python vehicle_detection_main.py "$@"
else
    VIDEO="$1"
    shift
    python vehicle_detection_main.py --video "$VIDEO" "$@"
fi
