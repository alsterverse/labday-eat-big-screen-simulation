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

- **blob_compete/** - Competitive blob environment with DQN training
- **assets/** - Game assets (images, etc.)
- **venv/** - Python virtual environment (excluded from git)

## Important Notes

- Always ensure the virtual environment is activated before running Python scripts
- The `venv/` directory is excluded from version control via `.gitignore`
- Model files (`.pth`, `.pkl`) are gitignored
