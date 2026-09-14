#!/bin/sh
set -eu

APP_DIR=/var/www/html
PERSIST_DIR=/data

mkdir -p "$PERSIST_DIR/data" "$PERSIST_DIR/uploads"

if [ ! -f "$PERSIST_DIR/data/minimarket.sqlite" ] && [ -f /opt/camilla-seed/data/minimarket.sqlite ]; then
  cp /opt/camilla-seed/data/minimarket.sqlite "$PERSIST_DIR/data/minimarket.sqlite"
fi

if [ -d /opt/camilla-seed/uploads ]; then
  cp -an /opt/camilla-seed/uploads/. "$PERSIST_DIR/uploads/" 2>/dev/null || true
fi

rm -rf "$APP_DIR/data" "$APP_DIR/uploads"
ln -s "$PERSIST_DIR/data" "$APP_DIR/data"
ln -s "$PERSIST_DIR/uploads" "$APP_DIR/uploads"

chown -R www-data:www-data "$PERSIST_DIR" || true

exec "$@"
