#!/bin/bash
set -e

SERVER="root@206.189.108.247"
REMOTE_DIR="/root/app"

echo "Deploying to $SERVER..."

# Sync backend
rsync -avz --delete \
  --exclude 'node_modules/' \
  backend/ $SERVER:$REMOTE_DIR/backend/

# Sync frontend
rsync -avz --delete \
  frontend/ $SERVER:$REMOTE_DIR/frontend/

# Sync root config files
rsync -avz \
  docker-compose.yml \
  nginx.conf \
  $SERVER:$REMOTE_DIR/

# Build and run
ssh $SERVER "cd $REMOTE_DIR && docker compose up --build -d"

echo "Deployed! Site available at http://206.189.108.247"
