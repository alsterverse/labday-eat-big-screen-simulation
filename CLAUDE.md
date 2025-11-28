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
pip install -r requirements-python.txt
```

Note: The file is named `requirements-python.txt` (not `requirements.txt`) to prevent Netlify from auto-detecting this as a Python project when deploying the web version.

### Deactivating

To deactivate the virtual environment:

```bash
deactivate
```

## Project Structure

- **blob_compete/** - Competitive blob environment with DQN training
  - **web/** - Web version using Phaser.js (deploys to Netlify)
  - **assets/** - Game assets (images, sounds)
  - Python training scripts and models
- **venv/** - Python virtual environment (excluded from git)
- **netlify.toml** - Netlify deployment configuration

## Web Deployment

The `blob_compete/web/` directory contains a browser-based version that:
- Runs the trained AI models entirely in JavaScript
- Uses Phaser.js for rendering
- Loads model weights from JSON files
- Can be deployed to Netlify with zero build steps

## Important Notes

- Always ensure the virtual environment is activated before running Python scripts
- The `venv/` directory is excluded from version control via `.gitignore`
- Model files (`.pth`, `.pkl`) are gitignored but `.json` exports are included for web deployment
- `requirements-python.txt` (not `requirements.txt`) prevents Netlify Python detection
