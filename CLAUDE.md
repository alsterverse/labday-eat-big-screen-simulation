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

- **blob_compete/** - Python competitive blob environment with DQN training
- **blob_compete_js/** - JavaScript/Node.js version with WebSocket multiplayer
- **venv/** - Python virtual environment (excluded from git)

## blob_compete_js (Node.js Server)

The JavaScript version runs as a Node.js WebSocket server with shared simulation.

### Setup

```bash
cd blob_compete_js
npm install
```

### Running

```bash
npm start        # Start server on port 3000
npm run dev      # Start with auto-reload
```

### URLs

- **Spectator mode:** http://localhost:3000/ - View the simulation
- **Player mode:** http://localhost:3000/play - Join as a player blob

### Structure

```
blob_compete_js/
├── server/           # Node.js WebSocket server
│   ├── index.js      # Express + WebSocket entry point
│   ├── game-server.js # Game loop (30Hz)
│   ├── websocket-handler.js
│   └── shared/       # Game logic modules
├── client/           # Browser client
│   ├── index.html    # Spectator mode
│   ├── play.html     # Player mode
│   └── js/           # Client scripts
├── weights/          # DQN model weights (JSON)
└── package.json
```

### How it works

- Server runs 2 AI blobs continuously
- Visiting `/play` spawns a player blob (despawns on disconnect)
- Multiple players can join simultaneously
- Players control with A/D keys (turn left/right)

## Important Notes

- Always ensure the virtual environment is activated before running Python scripts
- The `venv/` and `node_modules/` directories are excluded from version control
- Model files (`.pth`, `.pkl`) are gitignored
