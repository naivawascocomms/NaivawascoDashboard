# NAIVAWASCO Infrastructure

Deployment control repository for the NAIVAWASCO production system.

Inside this monorepo, `naivawasco-infra/` is the infrastructure subdirectory for staging/production deployment assets.

If you later split repositories, this repo is intended to be separate from:

- `naivawasco-backend` - Django API
- `naivawasco-frontend` - React web app
- `naivawasco-mobile` - Expo Android app

## Structure

```text
compose/
  docker-compose.prod.yml
  docker-compose.staging.yml
  .env.prod.example
  .env.staging.example
scripts/
  deploy.sh
  backup_postgres.sh
  restore_postgres.sh
  healthcheck.sh
docs/
  runbook.md
.github/workflows/
  deploy-production.yml
  deploy-staging.yml
```

For the current monorepo server-clone workflow, start with `../docs/server_clone_and_deploy.md`.

## Server Directories

On the Ubuntu server:

```bash
sudo mkdir -p /opt/naivawasco/infra
sudo mkdir -p /opt/naivawasco/prod/backups
sudo mkdir -p /opt/naivawasco/staging/backups
sudo mkdir -p /var/backups/naivawasco/prod
sudo mkdir -p /var/backups/naivawasco/staging
sudo chown -R deploy:deploy /opt/naivawasco /var/backups/naivawasco
```

Clone this repo to:

```bash
git clone <infra-repo-url> /opt/naivawasco/infra
```

Copy the Compose files and create real `.env` files:

```bash
cp compose/docker-compose.prod.yml /opt/naivawasco/prod/docker-compose.yml
cp compose/.env.prod.example /opt/naivawasco/prod/.env

cp compose/docker-compose.staging.yml /opt/naivawasco/staging/docker-compose.yml
cp compose/.env.staging.example /opt/naivawasco/staging/.env
```

Edit both `.env` files on the server. Never commit real secrets.

## First Deploy

```bash
chmod +x scripts/*.sh
./scripts/deploy.sh /opt/naivawasco/staging naivawasco-staging
./scripts/deploy.sh /opt/naivawasco/prod naivawasco-prod
```

## Cloudflare URLs

Recommended:

```text
https://staging.your-domain.com
https://app.your-domain.com
```

Both should point to the `frontend` service through Cloudflare Tunnel:

```text
http://frontend:80
```

The frontend should proxy `/api`, `/admin`, and `/static` to the backend service.

## Mobile API URLs

Staging:

```env
EXPO_PUBLIC_API_BASE_URL=https://staging.your-domain.com/api
```

Production:

```env
EXPO_PUBLIC_API_BASE_URL=https://app.your-domain.com/api
```

## Required GitHub Secrets

Infra repo environments:

```text
staging:
  GHCR_READ_TOKEN

production:
  GHCR_READ_TOKEN
```

If GHCR packages are public, a read token may not be needed. If private, create a fine-scoped token with package read permission.

## Deployment Flow

1. Backend repo builds and pushes Docker image to GHCR.
2. Frontend repo builds and pushes Docker image to GHCR.
3. Infra repo deploy workflow pulls the selected images.
4. Compose restarts containers.
5. Backend runs migrations and collectstatic during startup.
6. Healthcheck verifies the Cloudflare hostname.

Production deployment should use GitHub Environment approval.
