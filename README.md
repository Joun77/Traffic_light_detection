# Traffic Violation Detection System (Thesis FEN)

A real-time vehicle counting and red-light violation detection system using YOLO and FastAPI, featuring a modern web-based monitoring dashboard.

## 📁 Project Structure

The project is organized into a clean, modular structure:

- **`backend/`**: Python FastAPI server and AI detection logic.
- **`frontend/`**: Next.js web application with Lao language UI.
- **`models/`**: AI model weights (YOLO) and traffic light recognition models.
- **`data/`**: Configuration files (ROI config), label maps, and uploaded videos.
- **`outputs/`**: Generated evidence (images/videos) and CSV violation reports.
- **`docs/`**: Documentation, research notebooks, and guides.
- **`venv/`**: Python virtual environment.

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- Docker (for PostgreSQL database)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd vehicle_counting_tensorflow-master
   ```

2. **Setup Backend**:
   ```bash
   # Create and activate virtual environment
   python -m venv venv
   source venv/bin/activate

   # Install dependencies
   cd backend
   pip install -r requirements.txt
   ```

3. **Setup Frontend**:
   ```bash
   cd frontend
   npm install
   ```

4. **Setup Database**:
   Ensure Docker is running, then start the database container:
   ```bash
   docker-compose up -d db
   ```

## 🛠️ How to Run

You can run both the Backend and Frontend simultaneously using the provided master script:

```bash
bash start_all.sh
```

- **Web UI**: [http://localhost:3000](http://localhost:3000)
- **API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

### Manual Startup (Individual Tabs)

- **Backend**:
  ```bash
  cd backend
  source ../venv/bin/activate
  python api_main.py
  ```

- **Frontend**:
  ```bash
  cd frontend
  npm run dev
  ```

## 📸 Key Features
- **Real-time Monitoring**: Live stream of vehicle detection.
- **Violation Logging**: Automatic capturing of images and videos of red-light violations.
- **ROI Configuration**: Easy setup of detection zones through the web UI.
- **Lao UI**: Fully localized interface for local users.

## 📝 License
This project is part of a Thesis at FEN. See the [LICENSE](LICENSE) file for details.
