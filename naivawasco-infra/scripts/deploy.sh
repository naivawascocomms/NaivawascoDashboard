#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:?Usage: deploy.sh /opt/naivawasco/prod naivawasco-prod}"
PROJECT_NAME="${2:?Usage: deploy.sh /opt/naivawasco/prod naivawasco-prod}"

cd "$APP_DIR"

if [ ! -f ".env" ]; then
  echo "Missing $APP_DIR/.env"
  exit 1
fi

if [ ! -f "docker-compose.yml" ]; then
  echo "Missing $APP_DIR/docker-compose.yml"
  exit 1
fi

docker compose -p "$PROJECT_NAME" pull
docker compose -p "$PROJECT_NAME" up -d --remove-orphans
docker compose -p "$PROJECT_NAME" exec -T backend python manage.py check
docker compose -p "$PROJECT_NAME" ps

