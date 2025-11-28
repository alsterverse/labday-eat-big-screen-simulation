# Claude Code Development Guide

## Python Environment

This project uses **venv** (Python virtual environment) for dependency management.

### Setup

To set up the development environment:

```bash
# Create virtual environment (if not already created)
python3 -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

### Installing Dependencies

After activating the virtual environment, install project dependencies:

```bash
pip install -r requirements.txt
```

Note: If no `requirements.txt` exists yet, dependencies should be installed individually and then frozen:

```bash
pip freeze > requirements.txt
```

### Deactivating

To deactivate the virtual environment:

```bash
deactivate
```

## Project Structure

```
/
├── backend/          # Node.js WebSocket server
│   ├── src/          # Server source code
│   │   ├── index.js
│   │   ├── game-server.js
│   │   ├── websocket-handler.js
│   │   └── shared/   # Game logic modules
│   ├── weights/      # DQN model weights (JSON)
│   ├── package.json
│   └── Dockerfile
│
├── frontend/         # Static web client
│   ├── public/
│   │   ├── index.html
│   │   ├── play.html
│   │   ├── js/
│   │   └── assets/
│   └── Dockerfile
│
├── ml/               # Python ML training
│   └── blob_compete/
│
├── docker-compose.yml
├── nginx.conf
├── deploy.sh
└── venv/             # Python virtual environment
```

## Backend (Node.js Server)

The backend runs the game simulation and AI controllers via WebSocket.

### Setup

```bash
cd backend
npm install
```

### Running

```bash
npm start        # Start server on port 3000
npm run dev      # Start with auto-reload
```

### How it works

- Server runs 2 AI blobs continuously at 30Hz tick rate
- Broadcasts game state to all connected clients at 20Hz
- Players connect via WebSocket at `/ws/` or `/ws/play`
- Players control with A/D keys (turn left/right)

## Frontend (Nginx + Static Files)

The frontend serves static HTML/JS files and proxies WebSocket connections to the backend.

### URLs (Production)

- **Spectator mode:** http://206.189.108.247/ - View the simulation
- **Player mode:** http://206.189.108.247/play - Join as a player blob

## Deployment

The app is deployed to a **DigitalOcean Droplet** (`ssh root@206.189.108.247`) using Docker Compose with two containers:
- **backend**: Node.js WebSocket server (internal port 3000)
- **frontend**: Nginx serving static files (port 80), proxies `/ws` to backend

### Prerequisites

1. SSH key authentication set up with the VPS:
   ```bash
   ssh-copy-id root@206.189.108.247
   ```

2. Docker installed on the VPS:
   ```bash
   ssh root@206.189.108.247 "apt update && apt install -y docker.io docker-compose-plugin && systemctl enable docker && systemctl start docker"
   ```

### Deploy

```bash
./deploy.sh
```

This script:
1. Syncs `backend/` and `frontend/` directories to the VPS
2. Syncs `docker-compose.yml` and `nginx.conf`
3. Runs `docker compose up --build -d` on the server

### URL

http://206.189.108.247

## Important Notes

- Always ensure the virtual environment is activated before running Python scripts
- The `venv/` and `node_modules/` directories are excluded from version control
- Model files (`.pth`, `.pkl`) are gitignored
