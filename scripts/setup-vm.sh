#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

APP_ROOT="${APP_ROOT:-/srv/drama-mud}"
APP_USER="${APP_USER:-azureuser}"
SERVER_NAME="${SERVER_NAME:-_}"
WEB_ROOT="${WEB_ROOT:-/var/www/drama-mud}"
ENV_FILE="$APP_ROOT/shared/drama-mud.env"
ROOM_STORE_FILE="$APP_ROOT/shared/rooms.json"

sudo mkdir -p "$APP_ROOT/releases" "$APP_ROOT/shared" "$WEB_ROOT/current"
sudo chown -R "$APP_USER:$APP_USER" "$APP_ROOT" "$WEB_ROOT"

if ! command -v nginx >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y nginx
fi

if ! command -v git >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y git
fi

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pnpm >/dev/null 2>&1; then
  sudo corepack enable
  sudo corepack prepare pnpm@9.15.9 --activate
fi

sudo touch "$ENV_FILE" "$ROOM_STORE_FILE"
sudo chown "$APP_USER:$APP_USER" "$ENV_FILE" "$ROOM_STORE_FILE"

if [[ ! -s "$ROOM_STORE_FILE" ]]; then
  echo '[]' | sudo tee "$ROOM_STORE_FILE" >/dev/null
  sudo chown "$APP_USER:$APP_USER" "$ROOM_STORE_FILE"
fi

if ! sudo grep -q '^PORT=' "$ENV_FILE"; then
  echo 'PORT=3001' | sudo tee -a "$ENV_FILE" >/dev/null
fi

if ! sudo grep -q '^NPC_BACKEND=' "$ENV_FILE"; then
  echo 'NPC_BACKEND=llm' | sudo tee -a "$ENV_FILE" >/dev/null
fi

if ! sudo grep -q '^ROOM_STORE_PATH=' "$ENV_FILE"; then
  echo "ROOM_STORE_PATH=$ROOM_STORE_FILE" | sudo tee -a "$ENV_FILE" >/dev/null
fi

if ! sudo grep -q '^OPTIMUS_WORKSPACE_ROOT=' "$ENV_FILE"; then
  echo "OPTIMUS_WORKSPACE_ROOT=$APP_ROOT/current" | sudo tee -a "$ENV_FILE" >/dev/null
fi

sed \
  -e "s|__APP_ROOT__|$APP_ROOT|g" \
  -e "s|__APP_USER__|$APP_USER|g" \
  "$REPO_ROOT/ops/systemd/drama-mud.service" | sudo tee /etc/systemd/system/drama-mud.service >/dev/null

sed \
  -e "s|__SERVER_NAME__|$SERVER_NAME|g" \
  "$REPO_ROOT/ops/nginx/drama-mud.conf" | sudo tee /etc/nginx/sites-available/drama-mud.conf >/dev/null

sudo ln -sfn /etc/nginx/sites-available/drama-mud.conf /etc/nginx/sites-enabled/drama-mud.conf
sudo rm -f /etc/nginx/sites-enabled/default

sudo systemctl daemon-reload
sudo systemctl enable nginx drama-mud
sudo nginx -t
sudo systemctl restart nginx
