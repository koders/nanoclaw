#!/bin/bash
# NanoClaw deploy script — pull latest, build, and restart
set -e

NANOCLAW_DIR="/home/nanoclaw/nanoclaw"
PID_FILE="$NANOCLAW_DIR/nanoclaw.pid"
LOG_FILE="$NANOCLAW_DIR/nanoclaw.log"
cd "$NANOCLAW_DIR"

echo "📥 Pulling latest from origin/main..."
git pull origin main

echo "📦 Installing dependencies..."
npm install --production=false

echo "🔨 Building..."
npm run build

echo "🔄 Restarting NanoClaw..."
# Kill ALL node index.js processes (covers full path and relative path variants)
pkill -9 -f "node.*dist/index.js" 2>/dev/null || true
# Also kill via PID file if it exists
if [ -f "$PID_FILE" ]; then
  kill -9 "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
fi
sleep 2

# Verify no lingering processes
REMAINING=$(pgrep -f "node.*dist/index.js" -c 2>/dev/null || echo "0")
if [ "$REMAINING" -gt 0 ]; then
  echo "⚠️  Found $REMAINING lingering processes, force killing..."
  pkill -9 -f "node.*dist/index.js" 2>/dev/null || true
  sleep 1
fi

# Start new process in background with logging
nohup node dist/index.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "✅ NanoClaw restarted (PID: $(cat "$PID_FILE"))"
echo "📋 Logs: tail -f $LOG_FILE"
