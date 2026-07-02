#!/usr/bin/env bash
# Railway production start script.
#
# Expects a volume mounted at /data and these env vars:
#   DATABASE_URL           = file:/data/veritariff.db
#   VERITARIFF_STORAGE_DIR = /data/storage
set -euo pipefail

DB_PATH="${DATABASE_URL#file:}"
FIRST_BOOT=0
if [ ! -f "$DB_PATH" ]; then
  FIRST_BOOT=1
fi

mkdir -p "${VERITARIFF_STORAGE_DIR:-/data/storage}"

# Idempotent: creates/updates tables to match the Prisma schema.
npm run db:push

# Seed the demo fixture shipment only on the very first boot.
if [ "$FIRST_BOOT" = "1" ]; then
  npm run db:seed
fi

exec npm run start -w web
