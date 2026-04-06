#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-}"
if [[ -z "$SOURCE_DIR" || ! -d "$SOURCE_DIR" ]]; then
  echo "Usage: $0 <source-dir>" >&2
  exit 1
fi

APP_ROOT="${APP_ROOT:-/srv/drama-mud}"
APP_USER="${APP_USER:-azureuser}"
WEB_ROOT="${WEB_ROOT:-/var/www/drama-mud}"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
ENV_FILE="$APP_ROOT/shared/drama-mud.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$RELEASE_DIR"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'client/dist' \
  --exclude 'server/dist' \
  "$SOURCE_DIR"/ "$RELEASE_DIR"/

ln -sfn "$ENV_FILE" "$RELEASE_DIR/.env"

cd "$RELEASE_DIR"
pnpm install --frozen-lockfile
pnpm -r build

ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"
sudo mkdir -p "$WEB_ROOT/current"
sudo rsync -a --delete "$RELEASE_DIR/client/dist/" "$WEB_ROOT/current/"

sudo systemctl daemon-reload
sudo systemctl restart drama-mud
sudo nginx -t
sudo systemctl reload nginx

curl -fsS http://127.0.0.1:3001/api/games >/dev/null
echo "Deployed release $RELEASE_ID"
