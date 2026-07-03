#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:?Usage: restore_postgres.sh /opt/naivawasco/prod naivawasco-prod backup.dump[.gz]}"
PROJECT_NAME="${2:?Usage: restore_postgres.sh /opt/naivawasco/prod naivawasco-prod backup.dump[.gz]}"
BACKUP_FILE="${3:?Usage: restore_postgres.sh /opt/naivawasco/prod naivawasco-prod backup.dump[.gz]}"

cd "$APP_DIR"
set -a
source .env
set +a

mkdir -p backups

if [[ "$BACKUP_FILE" == *.gz ]]; then
  RESTORE_NAME="$(basename "$BACKUP_FILE" .gz)"
  gunzip -c "$BACKUP_FILE" > "backups/$RESTORE_NAME"
else
  RESTORE_NAME="$(basename "$BACKUP_FILE")"
  cp "$BACKUP_FILE" "backups/$RESTORE_NAME"
fi

echo "About to restore $RESTORE_NAME into $PROJECT_NAME/$POSTGRES_DB."
echo "This will clean existing database objects before restore."
read -r -p "Type RESTORE to continue: " CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Restore cancelled."
  exit 1
fi

docker compose -p "$PROJECT_NAME" exec db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "$1"' \
  sh "/backups/$RESTORE_NAME"

docker compose -p "$PROJECT_NAME" restart backend
echo "Restore complete."

