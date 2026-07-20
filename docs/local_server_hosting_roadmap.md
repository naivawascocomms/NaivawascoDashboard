# NAIVAWASCO Local Server Hosting Roadmap

Last updated: 2026-06-10

This roadmap turns the NAIVAWASCO codebase into a repeatable local-server deployment with Docker containers, CI/CD, backups, monitoring, and a clear go-live path. It complements:

- `docs/server_clone_and_deploy.md` for the canonical monorepo clone-and-deploy runbook.
- `deployment-docker.md` for the current simple local Docker deployment.
- `docs/devops_operations_guide.md` for the longer operations guide.
- `naivawasco-infra/` for production and staging Compose files, deployment scripts, and GitHub Actions deployment workflows.

## Target Outcome

Host the NAIVAWASCO web application on an internal local server so staff can access it through a secure Cloudflare Tunnel by default, with LAN access only as a temporary fallback while validating the deployment. Deployments should remain repeatable and controlled through CI/CD.

The final production stack should run:

- PostgreSQL database container.
- Django/Gunicorn backend container.
- React frontend served by Nginx.
- Mobile app access through the Django API.
- Optional Cloudflare Tunnel container for HTTPS access without opening public inbound ports.
- Scheduled database backups.
- CI pipelines for backend, frontend, mobile, and deployment.

## Recommended Architecture

```text
Staff browsers / Android app
        |
        | LAN HTTP or Cloudflare HTTPS
        v
Local Ubuntu server
        |
        +-- Docker Compose project
            +-- frontend: Nginx + built React app
            |   +-- proxies /api, /admin, /static to backend
            +-- backend: Django + DRF + Gunicorn
            +-- db: PostgreSQL
            +-- mobile app: Django API client over /api
            +-- cloudflared: optional secure tunnel to Cloudflare
```

For the fastest internal deployment, use the root `docker-compose.yml` from this monorepo. For tunnel-only public access, pair it with `docker-compose.cloudflare.yml`. For staging/production with prebuilt images and Cloudflare, use `naivawasco-infra/compose/docker-compose.staging.yml` and `naivawasco-infra/compose/docker-compose.prod.yml`.

## Phase 1: Confirm Deployment Scope

Deliverables:

- Decide whether the first release is LAN-only or Cloudflare-exposed.
- Pick server hostname or static LAN IP.
- Frontend port: `8080` for LAN fallback only.
- Backend port: `8000`, exposed only if administrators need direct API access and you are not using the tunnel-only profile.
- Staging frontend port: `8081` if staging runs on the same server.
- Confirm mobile clients point to the Django API exposed by the server.

Recommended first milestone:

```text
Tunnel-only Docker deployment using root docker-compose.yml plus docker-compose.cloudflare.yml
```

Recommended second milestone:

```text
Staging and production deployment using naivawasco-infra with prebuilt GHCR images
```

## Phase 2: Prepare The Local Server

Recommended server baseline:

- Ubuntu Server 24.04 LTS.
- 4 CPU cores minimum.
- 8 GB RAM minimum, 16 GB preferred.
- 250 GB SSD minimum, 500 GB preferred.
- Static LAN IP.
- UPS or safe shutdown plan.

Install base packages:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw fail2ban htop jq unzip
sudo timedatectl set-timezone Africa/Nairobi
```

Create a deployment user:

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
```

Install Docker Engine and Compose plugin using Docker's official Ubuntu repository. After installation:

```bash
sudo usermod -aG docker deploy
docker version
docker compose version
docker run --rm hello-world
```

Firewall baseline:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
```

For LAN fallback access, allow the frontend port only from the local network, for example:

```bash
sudo ufw allow from 192.168.0.0/16 to any port 8080 proto tcp
```

If using Cloudflare Tunnel, do not open public ports `80`, `443`, `8000`, or `8080`.

## Phase 3: Configure Environment And Secrets

For the immediate local Compose deployment:

```powershell
Copy-Item .env.docker.example .env
```

Set production-safe values:

```env
POSTGRES_DB=naivawasco_local
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<long-random-password>

DJANGO_DEBUG=False
DJANGO_SECRET_KEY=<long-random-secret>
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,<SERVER_LAN_IP>
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,http://<SERVER_LAN_IP>:8080

FRONTEND_PORT=8080
BACKEND_PORT=8000
```

Rules:

- Never commit `.env`.
- Never put backend database credentials or server secrets in the Android app.
- Keep `DJANGO_DEBUG=False` for any shared server.
- Use Cloudflare HTTPS origins in CORS when moving from LAN to Cloudflare.

## Phase 4: Containerize And Run Locally

Current container inventory:

| Service | Source | Purpose | Port |
|---|---|---|---|
| `db` | `postgres:18-alpine` | PostgreSQL data store | internal |
| `backend` | `naivawass_dashboard/Dockerfile` | Django, migrations, static collection, Gunicorn | `8000` |
| `frontend` | `production-pulse/Dockerfile` | Vite build served by Nginx, proxies API/admin/static | `8080 -> 80` |

The root Compose file uses the internal Docker Postgres service `db` and sets `DATABASE_URL` with `sslmode=disable` for that local container network path.

Start the stack from the repository root:

```powershell
docker compose up -d --build
```

Check services:

```powershell
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

Run Django verification:

```powershell
docker compose exec backend python manage.py check
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

Open:

```text
http://<SERVER_LAN_IP>:8080
http://<SERVER_LAN_IP>:8080/admin
http://<SERVER_LAN_IP>:8080/api
```

Users should normally access the frontend only. Nginx forwards `/api`, `/admin`, and `/static` to the backend container.

## Phase 5: Load Or Migrate Production Data

Preferred restore format is a PostgreSQL custom dump.

Create a dump from the current local database:

```powershell
pg_dump -h 127.0.0.1 -U postgres -d naivawasco_local -Fc -f backups\naivawasco_local.dump
```

Restore into the Docker database:

```powershell
docker compose exec db pg_restore -U postgres -d naivawasco_local --clean --if-exists /backups/naivawasco_local.dump
docker compose restart backend
```

Validation after restore:

- Admin login works.
- Dashboard API endpoints return data.
- Production dashboard totals match known workbook/database totals.
- Distribution dashboard totals match known workbook/database totals.
- Incidents load.
- Metering assignments load for at least one test user.
- Mobile sync, if enabled, can pull one test submission.

## Phase 6: Add Staging And Production Compose

Use the existing infra directory when the deployment matures beyond local builds:

```text
naivawasco-infra/
  compose/docker-compose.staging.yml
  compose/docker-compose.prod.yml
  compose/.env.staging.example
  compose/.env.prod.example
  scripts/deploy.sh
  scripts/backup_postgres.sh
  scripts/restore_postgres.sh
  scripts/healthcheck.sh
  .github/workflows/deploy-staging.yml
  .github/workflows/deploy-production.yml
```

Create server directories:

```bash
sudo mkdir -p /opt/naivawasco/infra
sudo mkdir -p /opt/naivawasco/staging/backups
sudo mkdir -p /opt/naivawasco/prod/backups
sudo mkdir -p /var/backups/naivawasco/staging
sudo mkdir -p /var/backups/naivawasco/prod
sudo chown -R deploy:deploy /opt/naivawasco /var/backups/naivawasco
```

Copy Compose files:

```bash
cp naivawasco-infra/compose/docker-compose.staging.yml /opt/naivawasco/staging/docker-compose.yml
cp naivawasco-infra/compose/docker-compose.prod.yml /opt/naivawasco/prod/docker-compose.yml
cp naivawasco-infra/compose/.env.staging.example /opt/naivawasco/staging/.env
cp naivawasco-infra/compose/.env.prod.example /opt/naivawasco/prod/.env
```

Edit both `.env` files on the server. Production should use:

```env
BACKEND_IMAGE=ghcr.io/<org>/naivawasco-backend:prod
FRONTEND_IMAGE=ghcr.io/<org>/naivawasco-frontend:prod
```

Staging should use:

```env
BACKEND_IMAGE=ghcr.io/<org>/naivawasco-backend:staging
FRONTEND_IMAGE=ghcr.io/<org>/naivawasco-frontend:staging
```

## Phase 7: CI Pipelines

The current workspace has no root `.github` workflows. Add CI before automating deployment.

The current workspace is a monorepo. If it stays that way, use path filters so only affected apps run:

- Backend changes under `naivawass_dashboard/**`.
- Frontend changes under `production-pulse/**`.
- Mobile changes under `meter-reading-mobile/**`.
- Infra changes under `naivawasco-infra/**`.

### Backend CI

Pipeline stages:

1. Install Python 3.13.
2. Start PostgreSQL service.
3. Install `naivawass_dashboard/requirements.txt`.
4. Run `python manage.py check`.
5. Run `python manage.py test`.
6. Build Docker image.
7. Push to GHCR on `develop` and `main`.

Required environment for tests:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/naivawasco_test
DJANGO_SECRET_KEY=test-secret
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
```

Image tags:

```text
develop -> ghcr.io/<org>/naivawasco-backend:staging
main    -> ghcr.io/<org>/naivawasco-backend:prod
all     -> ghcr.io/<org>/naivawasco-backend:<git-sha>
```

### Frontend CI

Pipeline stages:

1. Install Node 22.
2. Run `npm ci`.
3. Run `npm run lint`.
4. Run `npm run build` with `VITE_API_URL=/api`.
5. Build Docker image.
6. Push to GHCR on `develop` and `main`.

Image tags:

```text
develop -> ghcr.io/<org>/naivawasco-frontend:staging
main    -> ghcr.io/<org>/naivawasco-frontend:prod
all     -> ghcr.io/<org>/naivawasco-frontend:<git-sha>
```

### Mobile CI

Pipeline stages:

1. Install Node 22.
2. Run `npm ci`.
3. Run `npm run typecheck`.
4. Build Android through Expo EAS when release builds are needed.

Mobile app environment rules:

- Staging build points to the staging API hostname.
- Production build points to the production API hostname.
- No database URLs or server secrets in Expo public config.

### Infra CI

Pipeline stages:

1. Validate Compose config.
2. Shellcheck deployment scripts.
3. Deploy staging after backend/frontend staging image updates.
4. Deploy production only after approval.
5. Run healthchecks.

Useful checks:

```bash
docker compose -f compose/docker-compose.staging.yml config
docker compose -f compose/docker-compose.prod.yml config
shellcheck scripts/*.sh
```

## Phase 8: CD Deployment Flow

Recommended branch model:

```text
feature/* -> pull request
develop   -> staging
main      -> production
```

Staging flow:

1. Merge backend/frontend changes to `develop`.
2. CI runs tests and builds staging images.
3. Images are pushed to GHCR with `:staging` and `:<git-sha>` tags.
4. Infra staging workflow runs on the self-hosted runner.
5. Compose pulls images and restarts containers.
6. Healthcheck verifies frontend and API.

Production flow:

1. Test staging.
2. Merge approved changes to `main`.
3. CI builds `:prod` images.
4. Infra production workflow waits for GitHub Environment approval.
5. Compose pulls images and restarts production.
6. Healthcheck verifies production.
7. Record release version, image tags, and backup status.

Rollback flow:

1. Edit `/opt/naivawasco/prod/.env`.
2. Set `BACKEND_IMAGE` and `FRONTEND_IMAGE` to the previous known-good tags.
3. Run:

```bash
cd /opt/naivawasco/prod
docker compose -p naivawasco-prod pull
docker compose -p naivawasco-prod up -d
docker compose -p naivawasco-prod exec -T backend python manage.py check
```

Do not roll back database migrations blindly. Restore into staging first if schema changes are involved.

## Phase 9: GitHub Actions Implementation Checklist

Add these workflows if using a monorepo:

```text
.github/workflows/backend-ci.yml
.github/workflows/frontend-ci.yml
.github/workflows/mobile-ci.yml
.github/workflows/publish-backend-image.yml
.github/workflows/publish-frontend-image.yml
.github/workflows/deploy-staging.yml
.github/workflows/deploy-production.yml
```

If you later split the monorepo into separate repositories, keep:

- Backend CI and image publish in the backend repo.
- Frontend CI and image publish in the frontend repo.
- Mobile CI and EAS build in the mobile repo.
- Deployment workflows in the infra repo.

Required GitHub settings:

- Protect `main`.
- Require pull request review for `main`.
- Require CI checks before merge.
- Create `staging` and `production` GitHub Environments.
- Require approval for `production`.
- Add a self-hosted runner on the local server with label `naivawasco-prod`.
- Store registry/deploy secrets in GitHub Environments.

Required secrets:

```text
GHCR_READ_TOKEN        only if GHCR packages are private
INFRA_REPO_PAT         only if app repos trigger infra repo dispatch
EXPO_TOKEN             only for mobile EAS builds
```

## Phase 10: Backups And Disaster Recovery

Use the existing script:

```bash
naivawasco-infra/scripts/backup_postgres.sh
```

Install nightly cron on the server:

```cron
15 23 * * * /opt/naivawasco/infra/scripts/backup_postgres.sh /opt/naivawasco/prod naivawasco-prod /var/backups/naivawasco/prod >> /var/log/naivawasco-backup.log 2>&1
```

Backup policy:

- Keep at least 30 days locally.
- Copy backups off-server daily or weekly.
- Test restore into staging monthly.
- Store restore instructions with administrator credentials in a secure internal location.

Restore command:

```bash
/opt/naivawasco/infra/scripts/restore_postgres.sh /opt/naivawasco/staging naivawasco-staging /var/backups/naivawasco/prod/<backup>.dump.gz
```

## Phase 11: Monitoring And Operations

Minimum daily checks:

```bash
docker compose -p naivawasco-prod ps
docker compose -p naivawasco-prod logs --tail=100 backend
docker compose -p naivawasco-prod logs --tail=100 frontend
df -h
```

Recommended monitoring:

- Uptime Kuma check for frontend URL.
- Uptime Kuma check for `/api/`.
- Cloudflare Tunnel health alerts if using Cloudflare.
- Disk usage alert for Docker and backup directories.
- Log rotation for `/var/log/naivawasco-*.log`.

Operational response targets:

| Situation | First action |
|---|---|
| Frontend down | Check `frontend` container and Nginx logs |
| Login/API failing | Check `backend` logs and `python manage.py check` |
| Database errors | Check `db` health and disk space |
| Mobile readings missing | Check mobile API URL, backend logs, assignments, and user profile |
| Cloudflare URL down | Check `cloudflared` logs and tunnel status |

## Phase 12: Go-Live Checklist

Do not declare the local server live until all items below are complete:

- Server has static IP or stable hostname.
- Docker and Compose are installed.
- `.env` has production-safe secrets.
- `DJANGO_DEBUG=False`.
- Database container is healthy.
- Backend migrations run successfully.
- Static files are collected successfully.
- Frontend loads from another machine on the LAN.
- Login works.
- Admin works.
- Production dashboards load real data.
- Distribution dashboards load real data.
- Incidents load and can be updated by an authorized user.
- Meter reading assignments load.
- Mobile sync is either working or explicitly disabled.
- Nightly backups run.
- Latest backup restore has been tested in staging or a disposable database.
- CI checks pass for backend, frontend, and mobile.
- Docker images are pushed to GHCR if using CI/CD deployment.
- Production deploy workflow requires approval.
- Rollback has been tested with previous image tags.
- Staff access accounts are created.
- Admin recovery credentials are stored securely.

## Practical Execution Order

Use this order to avoid blocking on CI/CD before the application is usable:

1. Run the tunnel-only Docker deployment with the root `docker-compose.yml` plus `docker-compose.cloudflare.yml`.
2. Restore or seed data.
3. Validate the app with real users on the LAN.
4. Add backups and restore testing.
5. Add staging/prod Compose from `naivawasco-infra`.
6. Add backend/frontend/mobile CI.
7. Add GHCR image publishing.
8. Install the self-hosted GitHub runner.
9. Enable staging deployment.
10. Enable production deployment with approval.
11. Add Cloudflare Tunnel if external secure access is needed.
12. Run a full release and rollback drill.

## Definition Of Done

The hosting setup is complete when a new commit can move through this path:

```text
Pull request -> CI checks -> staging image build -> staging deploy -> staging validation
-> main merge -> production image build -> approved production deploy -> healthcheck
```

And operations can prove:

- The system survives a server restart.
- A database backup can be restored.
- A failed release can be rolled back to previous image tags.
- Secrets are not stored in Git.
- The Android app never contains backend database credentials or server secrets.
