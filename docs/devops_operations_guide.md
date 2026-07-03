# NAIVAWASCO DevOps Operations Guide

This guide describes how to host the NAIVAWASCO system on a local Ubuntu server, expose it securely through Cloudflare Tunnel without publishing `8000` or `8080` on the host, and run CI/CD for the current monorepo or for a later split-repository setup.

Last updated: 2026-05-28

## 1. Target Architecture

Recommended production architecture:

```text
Users / Android app
        |
        | HTTPS
        v
Cloudflare DNS + Tunnel + optional Cloudflare Access
        |
        | outbound tunnel from local server, no public inbound ports
        v
Ubuntu Server 24.04 LTS
        |
        +-- Docker Compose project: naivawasco-prod
            +-- frontend container: React app served by Nginx
            |   +-- proxies /api, /admin, /static to backend
            +-- backend container: Django + Gunicorn
            +-- postgres container: local PostgreSQL data store
            +-- cloudflared container: tunnel connector
            +-- backup job/container or host cron
```

Recommended public endpoints:

```text
https://app.naivawasco.example.com          Web frontend
https://app.naivawasco.example.com/api      Django API for web and Android
https://app.naivawasco.example.com/admin    Django admin, protected by Django and Cloudflare Access
```

Use one hostname for frontend and API. This avoids CORS complexity because the frontend and API share the same origin. The mobile app should use:

```env
EXPO_PUBLIC_API_BASE_URL=https://app.naivawasco.example.com/api
```

## 2. Recommended Technologies

Use these unless there is a strong operational reason not to:

| Area | Recommendation | Reason |
|---|---|---|
| Server OS | Ubuntu Server 24.04 LTS | Current LTS, stable Docker support |
| Runtime | Docker Engine + Docker Compose plugin | Repeatable deployments and rollback |
| Database | PostgreSQL in a Docker volume, with scheduled `pg_dump` backups | Simple local ownership and easy restore |
| Backend | Django + Gunicorn container | Matches current project |
| Frontend | Static React build served by Nginx container | Fast and simple; can proxy `/api` |
| Public access | Cloudflare Tunnel | No inbound firewall port required |
| CI | GitHub Actions on GitHub-hosted runners | Fast tests and image builds |
| CD | GitHub Actions self-hosted runner on Ubuntu server | Server is local/private; no public SSH exposure |
| Registry | GitHub Container Registry, `ghcr.io` | Works naturally with GitHub Actions |
| Mobile build | Expo EAS Build for signed Android builds; GitHub Actions for lint/typecheck | Avoids maintaining Android signing/toolchain on the server |
| Monitoring | Docker healthchecks, Uptime Kuma, Cloudflare tunnel status, log rotation | Low-cost operational visibility |
| Backups | Nightly `pg_dump -Fc`, off-server copy, restore test monthly | Protects against disk/server failure |

Official references:

- Docker Engine Ubuntu install: https://docs.docker.com/engine/install/ubuntu/
- Cloudflare Tunnel setup: https://developers.cloudflare.com/tunnel/setup/
- Cloudflare locally-managed tunnel: https://developers.cloudflare.com/tunnel/advanced/local-management/create-local-tunnel/
- GitHub Actions deployments/environments: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
- GitHub Actions Docker image publishing: https://docs.github.com/actions/guides/publishing-docker-images
- Expo GitHub/EAS builds: https://docs.expo.dev/build/building-from-github/
- PostgreSQL `pg_dump`: https://www.postgresql.org/docs/current/app-pgdump.html

## 3. Repository Layout

The current workspace is a monorepo that already contains backend, frontend, mobile, and infra directories. For the first server deployment, clone the monorepo as-is.

If you later decide to split ownership and deployment pipelines, use this target repository layout:

```text
naivawasco-backend       Django backend
naivawasco-frontend      React/Vite frontend
naivawasco-mobile        Expo Android app
naivawasco-infra         Docker Compose, Cloudflare config notes, deployment workflows
```

The infra repository should contain:

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
  deploy-staging.yml
  deploy-production.yml
```

Do not keep production secrets in any repository. Use server-side `.env` files and GitHub environment secrets.

For the current monorepo clone-and-deploy flow, see `docs/server_clone_and_deploy.md`.

## 4. Branching and Environments

Use the same branch policy in all repos:

```text
feature/*       Developer work
develop         Staging integration
main            Production-ready code
release/*       Optional release stabilization
hotfix/*        Emergency production fixes
```

Recommended rules:

- Pull requests into `develop` must pass CI.
- Pull requests into `main` must pass CI and require at least one review.
- `main` is protected and cannot be pushed directly.
- `develop` deploys to staging automatically.
- `main` deploys to production only after GitHub Environment approval.
- Tag production releases as `vYYYY.MM.DD.N`, for example `v2026.05.28.1`.

Create GitHub Environments:

```text
staging
production
```

For `production`, enable:

- Required reviewers.
- Environment secrets.
- Deployment branch restriction: only `main` and tags.
- Concurrency so only one production deployment runs at a time.

## 5. Ubuntu Server Preparation

### 5.1 Hardware Baseline

Minimum for production:

```text
CPU: 4 cores
RAM: 8 GB minimum, 16 GB recommended
Disk: 250 GB SSD minimum, 500 GB+ recommended
UPS: strongly recommended
Network: stable LAN and internet
```

Partitioning recommendation:

```text
/                       60 GB
/var/lib/docker         120 GB+
/var/backups            80 GB+
/opt/naivawasco         20 GB
```

If the server has only one disk, still create clear directories. If it has multiple disks, place `/var/lib/docker` and `/var/backups` on separate volumes.

### 5.2 Base OS Setup

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

Lock down SSH:

```bash
sudo nano /etc/ssh/sshd_config
```

Set:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Restart SSH:

```bash
sudo systemctl restart ssh
```

Firewall:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

Do not open ports 80, 443, 8000, or 8080 publicly. Cloudflare Tunnel will make outbound connections.

### 5.3 Install Docker Engine

Follow Docker's official Ubuntu repository method:

```bash
sudo apt remove -y docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc || true
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker deploy
```

Log out and back in as `deploy`, then verify:

```bash
docker version
docker compose version
docker run --rm hello-world
```

## 6. Server Directory Layout

Create production and staging directories:

```bash
sudo mkdir -p /opt/naivawasco/prod
sudo mkdir -p /opt/naivawasco/staging
sudo mkdir -p /var/backups/naivawasco/prod
sudo mkdir -p /var/backups/naivawasco/staging
sudo chown -R deploy:deploy /opt/naivawasco /var/backups/naivawasco
```

Production:

```text
/opt/naivawasco/prod/
  docker-compose.yml
  .env
  backups/
```

Staging:

```text
/opt/naivawasco/staging/
  docker-compose.yml
  .env
  backups/
```

Use separate Compose project names and separate database volumes:

```bash
docker compose -p naivawasco-prod up -d
docker compose -p naivawasco-staging up -d
```

## 7. Production Docker Compose

In the infra repository, create `compose/docker-compose.prod.yml`.

Use prebuilt images from GHCR instead of building on the server:

```yaml
services:
  db:
    image: postgres:18-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10

  backend:
    image: ${BACKEND_IMAGE}
    restart: unless-stopped
    environment:
      DJANGO_DEBUG: "False"
      DJANGO_SECRET_KEY: ${DJANGO_SECRET_KEY}
      DJANGO_ALLOWED_HOSTS: ${DJANGO_ALLOWED_HOSTS}
      DJANGO_CORS_ALLOWED_ORIGINS: ${DJANGO_CORS_ALLOWED_ORIGINS}
      DJANGO_CSRF_TRUSTED_ORIGINS: ${DJANGO_CSRF_TRUSTED_ORIGINS}
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?sslmode=disable
      DATABASE_CONN_MAX_AGE: ${DATABASE_CONN_MAX_AGE:-60}
    depends_on:
      db:
        condition: service_healthy
    command: >
      sh -c "python manage.py migrate --noinput
      && python manage.py collectstatic --noinput
      && gunicorn dashboard.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --timeout 120"
    expose:
      - "8000"

  frontend:
    image: ${FRONTEND_IMAGE}
    restart: unless-stopped
    depends_on:
      - backend
    expose:
      - "80"

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - frontend

volumes:
  postgres_data:
```

The frontend container should proxy `/api`, `/admin`, and `/static` to `backend:8000`. If the frontend repository's Nginx config does not already do this, add it there.

Example production `.env` on the server:

```env
POSTGRES_DB=naivawasco_prod
POSTGRES_USER=naivawasco
POSTGRES_PASSWORD=<long-random-password>

DJANGO_SECRET_KEY=<long-random-secret>
DJANGO_ALLOWED_HOSTS=app.naivawasco.example.com,localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=https://app.naivawasco.example.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.naivawasco.example.com
DATABASE_CONN_MAX_AGE=60
GUNICORN_WORKERS=3

BACKEND_IMAGE=ghcr.io/<org>/naivawasco-backend:prod
FRONTEND_IMAGE=ghcr.io/<org>/naivawasco-frontend:prod

CLOUDFLARE_TUNNEL_TOKEN=<cloudflare-tunnel-token>
```

## 8. Cloudflare Tunnel Setup

Recommended: use a Cloudflare-managed tunnel with a token, then run `cloudflared` as a Docker Compose service. The frontend and backend stay internal-only; Cloudflare is the only public ingress.

Prerequisites:

- Cloudflare account.
- Domain managed by Cloudflare.
- Ubuntu server has outbound internet access.
- Server can reach Cloudflare. If restricted, verify outbound connectivity on Cloudflare's tunnel ports.

### 8.1 Create Tunnel

In Cloudflare dashboard:

1. Go to **Zero Trust** or **Networking > Tunnels**.
2. Create a tunnel named `naivawasco-prod`.
3. Choose Docker or Linux as the connector type.
4. Copy the tunnel token.
5. Store the token only in `/opt/naivawasco/prod/.env`.

### 8.2 Publish Routes

Add a public hostname:

```text
Hostname: app.naivawasco.example.com
Service:  http://frontend:80
```

If using dashboard-managed tunnel routes from a Docker connector, Cloudflare handles the DNS CNAME to the tunnel. If using local management, the equivalent command is:

```bash
cloudflared tunnel route dns <UUID-or-NAME> app.naivawasco.example.com
```

For staging:

```text
Hostname: staging.naivawasco.example.com
Service:  http://frontend:80
```

Use a separate tunnel or at least a separate hostname route. Separate tunnels are cleaner for production/staging isolation.

If you are deploying the current monorepo with the root Compose files, pair them with `docker-compose.cloudflare.yml` so Docker does not publish host ports.

### 8.3 Protect Admin and Staging

Use Cloudflare Access policies:

```text
Protect: https://app.naivawasco.example.com/admin/*
Allow: approved admin emails only
```

For staging:

```text
Protect: https://staging.naivawasco.example.com/*
Allow: internal staff/admin emails only
```

Do not rely on Cloudflare Access alone. Django authentication and permissions still apply.

### 8.4 Mobile App URL

For production APK/AAB builds:

```env
EXPO_PUBLIC_API_BASE_URL=https://app.naivawasco.example.com/api
```

For staging builds:

```env
EXPO_PUBLIC_API_BASE_URL=https://staging.naivawasco.example.com/api
```

## 9. Backend Repository CI/CD

Backend repo responsibilities:

- Run Python checks and tests.
- Build backend Docker image.
- Push image to GHCR.
- Optionally trigger infra deployment.

Required repository secrets:

```text
GHCR_TOKEN             optional; GITHUB_TOKEN is enough for same-org GHCR in many cases
INFRA_REPO_PAT         if triggering infra repo workflow_dispatch
```

Recommended `.github/workflows/ci.yml`:

```yaml
name: Backend CI

on:
  pull_request:
  push:
    branches: [develop, main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18-alpine
        env:
          POSTGRES_DB: naivawasco_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d naivawasco_test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/naivawasco_test
      DJANGO_SECRET_KEY: test-secret
      DJANGO_DEBUG: "False"
      DJANGO_ALLOWED_HOSTS: localhost,127.0.0.1
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - run: python -m pip install --upgrade pip
      - run: pip install -r requirements.txt
      - run: python manage.py check
      - run: python manage.py test
```

Recommended `.github/workflows/publish-image.yml`:

```yaml
name: Publish Backend Image

on:
  push:
    branches: [develop, main]
  release:
    types: [published]

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository_owner }}/naivawasco-backend
          tags: |
            type=ref,event=branch
            type=sha
            type=raw,value=staging,enable=${{ github.ref_name == 'develop' }}
            type=raw,value=prod,enable=${{ github.ref_name == 'main' }}
            type=semver,pattern={{version}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

## 10. Frontend Repository CI/CD

Frontend repo responsibilities:

- Run lint/typecheck/build.
- Build an Nginx image containing the static frontend.
- Build staging and production with the correct API path.

For this architecture, build with:

```env
VITE_API_URL=/api
```

That keeps the frontend portable across staging and production hostnames.

Recommended `.github/workflows/ci.yml`:

```yaml
name: Frontend CI

on:
  pull_request:
  push:
    branches: [develop, main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
        env:
          VITE_API_URL: /api
```

Recommended image publish workflow:

```yaml
name: Publish Frontend Image

on:
  push:
    branches: [develop, main]
  release:
    types: [published]

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository_owner }}/naivawasco-frontend
          tags: |
            type=ref,event=branch
            type=sha
            type=raw,value=staging,enable=${{ github.ref_name == 'develop' }}
            type=raw,value=prod,enable=${{ github.ref_name == 'main' }}
            type=semver,pattern={{version}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          build-args: |
            VITE_API_URL=/api
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

## 11. Mobile Repository CI/CD

Mobile repo responsibilities:

- Run TypeScript checks.
- Build staging APK for internal testing.
- Build production AAB/APK for release.

Recommended environments:

```text
mobile-staging
mobile-production
```

Recommended secrets:

```text
EXPO_TOKEN
```

Recommended environment variables:

```text
EXPO_PUBLIC_API_BASE_URL=https://staging.naivawasco.example.com/api
EXPO_PUBLIC_API_BASE_URL=https://app.naivawasco.example.com/api
```

Recommended `.github/workflows/ci.yml`:

```yaml
name: Mobile CI

on:
  pull_request:
  push:
    branches: [develop, main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run typecheck
```

Recommended EAS build workflow:

```yaml
name: Android Build

on:
  workflow_dispatch:
    inputs:
      profile:
        type: choice
        required: true
        options: [preview, production]
  push:
    branches: [main]

jobs:
  build-android:
    runs-on: ubuntu-latest
    environment: ${{ inputs.profile == 'production' && 'mobile-production' || 'mobile-staging' }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      - run: eas build --platform android --profile ${{ inputs.profile || 'production' }} --non-interactive
        env:
          EXPO_PUBLIC_API_BASE_URL: ${{ vars.EXPO_PUBLIC_API_BASE_URL }}
```

Use EAS build profiles:

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

Operational rule: install staging APK only for testers. Production builds should point only to the production Cloudflare hostname.

## 12. Infra Repository Deployment Workflows

Use a self-hosted runner on the Ubuntu server for deployment because the server is local/private and should not expose SSH publicly.

### 12.1 Install Self-Hosted Runner

In GitHub:

1. Open the infra repository.
2. Go to **Settings > Actions > Runners**.
3. Add a new Linux x64 runner.
4. Follow the commands GitHub shows.
5. Install it as a service.

On server, run it under the `deploy` user.

Label it:

```text
naivawasco-prod
```

For staging on the same server, use the same runner but separate Compose project and directory. If you have a second server, use a separate runner label:

```text
naivawasco-staging
```

### 12.2 Deployment Script

Create `scripts/deploy.sh` in the infra repo:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:?Usage: deploy.sh /opt/naivawasco/prod}"
PROJECT_NAME="${2:?Usage: deploy.sh /opt/naivawasco/prod naivawasco-prod}"

cd "$APP_DIR"

docker compose -p "$PROJECT_NAME" pull
docker compose -p "$PROJECT_NAME" up -d --remove-orphans
docker compose -p "$PROJECT_NAME" exec -T backend python manage.py check
docker compose -p "$PROJECT_NAME" ps
```

Make executable:

```bash
chmod +x scripts/deploy.sh
```

### 12.3 Production Deploy Workflow

`naivawasco-infra/.github/workflows/deploy-production.yml`:

```yaml
name: Deploy Production

on:
  workflow_dispatch:
  repository_dispatch:
    types: [backend-prod-image, frontend-prod-image]

concurrency:
  group: naivawasco-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: [self-hosted, naivawasco-prod]
    environment:
      name: production
      url: https://app.naivawasco.example.com
    steps:
      - uses: actions/checkout@v4
      - name: Copy compose file
        run: |
          cp compose/docker-compose.prod.yml /opt/naivawasco/prod/docker-compose.yml
      - name: Login to GHCR
        run: echo "${{ secrets.GHCR_READ_TOKEN }}" | docker login ghcr.io -u "${{ github.actor }}" --password-stdin
      - name: Deploy
        run: ./scripts/deploy.sh /opt/naivawasco/prod naivawasco-prod
      - name: Healthcheck
        run: |
          curl -fsS https://app.naivawasco.example.com/ >/dev/null
          curl -fsS https://app.naivawasco.example.com/api/ >/dev/null || true
```

Create `GHCR_READ_TOKEN` as a production environment secret if the packages are private.

### 12.4 Staging Deploy Workflow

`naivawasco-infra/.github/workflows/deploy-staging.yml`:

```yaml
name: Deploy Staging

on:
  workflow_dispatch:
  repository_dispatch:
    types: [backend-staging-image, frontend-staging-image]

concurrency:
  group: naivawasco-staging
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: [self-hosted, naivawasco-prod]
    environment:
      name: staging
      url: https://staging.naivawasco.example.com
    steps:
      - uses: actions/checkout@v4
      - run: cp compose/docker-compose.staging.yml /opt/naivawasco/staging/docker-compose.yml
      - run: echo "${{ secrets.GHCR_READ_TOKEN }}" | docker login ghcr.io -u "${{ github.actor }}" --password-stdin
      - run: ./scripts/deploy.sh /opt/naivawasco/staging naivawasco-staging
```

## 13. Coordinating Separate Repositories

Because backend and frontend are separate repos, do not let each repo blindly deploy production by itself. Use the infra repo as the release coordinator.

Recommended flow:

1. Backend merge to `develop` builds `ghcr.io/<org>/naivawasco-backend:staging`.
2. Frontend merge to `develop` builds `ghcr.io/<org>/naivawasco-frontend:staging`.
3. Infra staging workflow deploys staging images.
4. Test staging web and mobile APK.
5. Promote backend and frontend changes to `main`.
6. Backend and frontend publish `:prod` images.
7. Infra production deployment runs after approval.
8. Mobile production build is created with production API URL.

Optional automation:

- Backend/frontend image workflows call `repository_dispatch` on the infra repo.
- Infra repo deploys staging automatically.
- Production still requires manual approval.

Example repository dispatch step from backend/frontend repo:

```yaml
- name: Trigger infra deployment
  if: github.ref_name == 'develop'
  run: |
    curl -X POST \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${{ secrets.INFRA_REPO_PAT }}" \
      https://api.github.com/repos/<org>/naivawasco-infra/dispatches \
      -d '{"event_type":"backend-staging-image"}'
```

Use a fine-scoped PAT or GitHub App token. Store it as `INFRA_REPO_PAT`.

## 14. Database Migration and Initial Data Load

### 14.1 First Deployment

Start the stack:

```bash
cd /opt/naivawasco/prod
docker compose -p naivawasco-prod up -d
docker compose -p naivawasco-prod logs -f backend
```

Create admin user:

```bash
docker compose -p naivawasco-prod exec backend python manage.py createsuperuser
```

### 14.2 Restore Existing Data

Copy dump into:

```text
/opt/naivawasco/prod/backups/naivawasco.dump
```

Restore:

```bash
cd /opt/naivawasco/prod
docker compose -p naivawasco-prod exec db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists /backups/naivawasco.dump'

docker compose -p naivawasco-prod restart backend
```

If restoring from a Django fixture instead of a PostgreSQL dump:

```bash
docker compose -p naivawasco-prod exec backend python manage.py loaddata /path/to/fixture.json
```

## 15. Backups

Backups are essential because the server is local.

### 15.1 Backup Script

Create `/opt/naivawasco/prod/backup_postgres.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT=naivawasco-prod
BACKUP_DIR=/var/backups/naivawasco/prod
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/naivawasco-prod-$TIMESTAMP.dump"

mkdir -p "$BACKUP_DIR"
cd /opt/naivawasco/prod

docker compose -p "$PROJECT" exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$FILE"

gzip "$FILE"
find "$BACKUP_DIR" -type f -name "*.dump.gz" -mtime +30 -delete
```

Make executable:

```bash
chmod +x /opt/naivawasco/prod/backup_postgres.sh
```

Cron:

```bash
crontab -e
```

Add:

```cron
15 23 * * * /opt/naivawasco/prod/backup_postgres.sh >> /var/log/naivawasco-backup.log 2>&1
```

### 15.2 Off-Server Copies

At minimum, copy backups to one of:

- External USB drive rotated weekly.
- NAS on the local network.
- Encrypted cloud storage.
- Another office machine.

Example with `rsync`:

```bash
rsync -av --delete /var/backups/naivawasco/prod/ backupuser@backup-host:/data/naivawasco/prod/
```

### 15.3 Restore Test

Monthly, restore the latest backup into staging:

```bash
gunzip -c latest.dump.gz > latest.dump
cd /opt/naivawasco/staging
docker compose -p naivawasco-staging exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists /backups/latest.dump'
```

Record the restore result in an operations log.

## 16. Monitoring and Health Checks

Minimum checks:

```bash
docker compose -p naivawasco-prod ps
docker compose -p naivawasco-prod logs --tail=100 backend
docker compose -p naivawasco-prod logs --tail=100 frontend
docker compose -p naivawasco-prod logs --tail=100 cloudflared
```

Recommended monitoring:

- Uptime Kuma on LAN or another server.
- HTTP check for `https://app.naivawasco.example.com`.
- HTTP check for `https://app.naivawasco.example.com/api/`.
- Disk usage alert for `/var/lib/docker` and `/var/backups`.
- Cloudflare tunnel status alert.

Install log rotation for custom logs:

```bash
sudo nano /etc/logrotate.d/naivawasco
```

Example:

```text
/var/log/naivawasco-*.log {
  daily
  rotate 30
  compress
  missingok
  notifempty
}
```

## 17. Security Checklist

Production must satisfy:

- `DJANGO_DEBUG=False`.
- Strong `DJANGO_SECRET_KEY`.
- Strong database password.
- No public database port.
- No public backend port.
- No public frontend port.
- Cloudflare Tunnel token stored only on server and GitHub environment secrets if needed.
- `/admin/*` protected with Cloudflare Access and Django auth.
- Main branch protected.
- Production GitHub environment requires approval.
- Server SSH uses keys only.
- Server has UPS or safe shutdown plan.
- Backups are encrypted or stored in a protected location.
- Restore tested monthly.

For Android:

- Do not put database credentials in the app.
- Use only `EXPO_PUBLIC_API_BASE_URL`.
- Field app uses offline queue for local reliability.
- Production build points to production URL only.

## 18. Deployment Runbook

### 18.1 Normal Production Release

1. Merge backend PR to `develop`.
2. Merge frontend PR to `develop`.
3. Confirm staging deploy completes.
4. Test:
   - Login.
   - Dashboards load.
   - Meter assignments load.
   - Mobile staging APK can submit readings.
   - Incident report and sync works.
5. Merge backend and frontend PRs to `main`.
6. Wait for image publish workflows.
7. Run infra production deploy workflow.
8. Approve GitHub production environment.
9. Confirm Cloudflare URL.
10. Build production mobile release.
11. Install/distribute Android build.
12. Record release version, image tags, and backup status.

### 18.2 Rollback

Use previous image tags in `/opt/naivawasco/prod/.env`:

```env
BACKEND_IMAGE=ghcr.io/<org>/naivawasco-backend:<previous-tag>
FRONTEND_IMAGE=ghcr.io/<org>/naivawasco-frontend:<previous-tag>
```

Deploy:

```bash
cd /opt/naivawasco/prod
docker compose -p naivawasco-prod pull
docker compose -p naivawasco-prod up -d
```

If rollback includes a database migration reversal, do not guess. Restore from backup into staging first and confirm the correct rollback path.

### 18.3 Server Restart

After power outage or maintenance:

```bash
sudo reboot
docker ps
cd /opt/naivawasco/prod
docker compose -p naivawasco-prod ps
docker compose -p naivawasco-prod logs --tail=100 cloudflared
```

Confirm:

```bash
curl -I https://app.naivawasco.example.com
```

## 19. Essential Pre-Live Checklist

Before declaring the system live:

- Production domain is active in Cloudflare.
- Cloudflare Tunnel is healthy.
- Production `.env` is complete.
- Backend image and frontend image are published.
- Database migrations run successfully.
- Admin user exists.
- Existing data restored and verified.
- Frontend login works.
- API token login works.
- Mobile app production build points to production API.
- Mobile app can queue offline readings and sync after reconnect.
- Mobile app can queue offline incident actions and sync after reconnect.
- Nightly backup cron is installed.
- Backup restore test completed.
- GitHub branch protection enabled.
- GitHub environments configured.
- Production deployment requires approval.
- Staff have documented login accounts.
- Admin has documented recovery credentials stored securely.

## 20. Maintenance Schedule

Daily:

- Check Cloudflare Tunnel status.
- Check backup file was created.
- Check disk usage.

Weekly:

- Review Docker logs for repeated errors.
- Apply normal Ubuntu package updates if safe.
- Test mobile sync from a field phone.

Monthly:

- Restore latest backup into staging.
- Review GitHub Actions failures.
- Review user accounts and remove inactive users.
- Check SSL/domain status in Cloudflare.

Quarterly:

- Rotate critical secrets.
- Test full disaster recovery on staging or spare machine.
- Review server disk health.
- Review UPS battery condition.
