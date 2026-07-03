#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:?Usage: backup_postgres.sh /opt/naivawasco/prod naivawasco-prod /var/backups/naivawasco/prod}"
PROJECT_NAME="${2:?Usage: backup_postgres.sh /opt/naivawasco/prod naivawasco-prod /var/backups/naivawasco/prod}"
BACKUP_DIR="${3:?Usage: backup_postgres.sh /opt/naivawasco/prod naivawasco-prod /var/backups/naivawasco/prod}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

cd "$APP_DIR"
set -a
source .env
set +a

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/${PROJECT_NAME}-${TIMESTAMP}.dump"

docker compose -p "$PROJECT_NAME" exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$FILE"

gzip "$FILE"
find "$BACKUP_DIR" -type f -name "*.dump.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Backup complete: ${FILE}.gz"

