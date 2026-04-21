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
sudo systemctl restart nanoclaw

echo "✅ NanoClaw restarted"
echo "📋 Logs: journalctl -u nanoclaw -f"
