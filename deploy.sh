#!/bin/bash
# NanoClaw deploy script — pull latest, build, and restart
set -e

NANOCLAW_DIR="/home/nanoclaw/nanoclaw"
cd "$NANOCLAW_DIR"

echo "📥 Pulling latest from origin/main..."
git pull origin main

echo "📦 Installing dependencies..."
npm install --production=false

echo "🔨 Building..."
npm run build

echo "🔄 Restarting NanoClaw..."
# Kill old process
pkill -f "node dist/index.js" 2>/dev/null || true
sleep 2

# Start new process in background with logging
nohup node dist/index.js >> /var/log/nanoclaw.log 2>&1 &

NEW_PID=$!
echo "✅ NanoClaw restarted (PID: $NEW_PID)"
echo "📋 Logs: tail -f /var/log/nanoclaw.log"
