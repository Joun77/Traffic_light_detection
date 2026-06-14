#!/bin/bash

# start_all.sh — Script to run both Backend and Frontend simultaneously

# Colors for Terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Traffic Monitoring System...${NC}"

# 1. Run Backend (FastAPI) in background
echo -e "${GREEN}📡 Starting Backend (API) on Port 8000...${NC}"
cd backend
source ../venv/bin/activate
python api_main.py &
BACKEND_PID=$!
cd ..

# 2. Run Frontend (Next.js) in background
echo -e "${GREEN}💻 Starting Frontend (Web UI) on Port 3000...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo -e "${BLUE}✅ All systems are running!${NC}"
echo -e "Backend PID: $BACKEND_PID"
echo -e "Frontend PID: $FRONTEND_PID"
echo -e "--------------------------------------------------"
echo -e "Press ${BLUE}CTRL+C${NC} to stop both systems simultaneously"

# Function to kill both processes on CTRL+C
cleanup() {
    echo -e "\n${BLUE}🛑 Stopping systems...${NC}"
    kill $BACKEND_PID
    kill $FRONTEND_PID
    exit
}

trap cleanup SIGINT

# Keep script running until interrupted
wait
