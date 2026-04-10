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
APP_BASE_PATH="${APP_BASE_PATH:-/drama-mud/}"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
ENV_FILE="$APP_ROOT/shared/drama-mud.env"
ACCESS_CODE="$(grep -m1 '^DRAMA_MUD_ACCESS_CODE=' "$ENV_FILE" | cut -d= -f2- || true)"

APP_BASE_PATH="/${APP_BASE_PATH#/}"
APP_BASE_PATH="${APP_BASE_PATH%/}/"

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
VITE_APP_BASE_PATH="$APP_BASE_PATH" pnpm -r build

ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"
sudo mkdir -p "$WEB_ROOT/current$APP_BASE_PATH"
sudo rsync -a --delete "$RELEASE_DIR/client/dist/" "$WEB_ROOT/current$APP_BASE_PATH"

sudo systemctl daemon-reload
sudo systemctl restart drama-mud
sudo nginx -t
sudo systemctl reload nginx

for _ in $(seq 1 20); do
  if curl -fsS ${ACCESS_CODE:+-H "x-drama-access-code: $ACCESS_CODE"} http://127.0.0.1:3001/api/games >/dev/null; then
    echo "Deployed release $RELEASE_ID"
    exit 0
  fi
  sleep 1
done

sudo systemctl status drama-mud --no-pager --lines 50 >&2
echo "Deployment completed, but the server did not become healthy in time." >&2
exit 1
