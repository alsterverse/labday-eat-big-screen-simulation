#!/bin/bash
set -e

# Use environment variables or defaults for local development
VPS_USER="${VPS_USER:-root}"
VPS_HOST="${VPS_HOST:-206.189.108.247}"
SSH_KEY="${SSH_KEY:-}"

SERVER="${VPS_USER}@${VPS_HOST}"
REMOTE_DIR="/root/app"

# Build SSH options
SSH_OPTS=""
if [ -n "$SSH_KEY" ]; then
  SSH_OPTS="-i $SSH_KEY"
fi

echo "Deploying to $SERVER..."

# Sync backend
rsync -avz --delete \
  --exclude 'node_modules/' \
  -e "ssh $SSH_OPTS" \
  backend/ $SERVER:$REMOTE_DIR/backend/

# Sync frontend
rsync -avz --delete \
  -e "ssh $SSH_OPTS" \
  frontend/ $SERVER:$REMOTE_DIR/frontend/

# Sync root config files
rsync -avz \
  -e "ssh $SSH_OPTS" \
  docker-compose.yml \
  nginx.conf \
  $SERVER:$REMOTE_DIR/

# Build and run
ssh $SSH_OPTS $SERVER "cd $REMOTE_DIR && docker compose up --build -d"

echo "Deployed! Site available at http://$VPS_HOST"
