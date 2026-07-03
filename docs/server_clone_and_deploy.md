# NAIVAWASCO Server Clone And Deploy

Last updated: 2026-06-25

This is the canonical first-deploy runbook for the current NAIVAWASCO monorepo. Use it when you want to clone the repository onto a local Ubuntu server, start the web stack with Docker, and optionally expose it through Cloudflare Tunnel.

Use this document first. The other deployment documents provide deeper architecture and operations detail:

- `deployment-docker.md` - short LAN deployment guide
- `docs/local_server_hosting_roadmap.md` - phased hosting roadmap
- `docs/devops_operations_guide.md` - Cloudflare, CI/CD, backups, and operations detail
- `naivawasco-infra/` - staging/production Compose files and deployment scripts

## 1. What This Repository Contains

This workspace is currently a monorepo. Clone this one repository to the server.

```text
NAIVAWASCO/
  naivawass_dashboard/    Django backend
  production-pulse/       React frontend
  meter-reading-mobile/   Expo Android app
  naivawasco-infra/       staging/prod Compose and deploy scripts
  docker-compose.yml      local server Compose
```

Do not split this into separate repositories unless you are also ready to change the deployment process and CI/CD docs.

## 2. Recommended First Milestone

Use this order:

1. Clone the monorepo onto the server.
2. Run the root `docker-compose.yml` for LAN validation.
3. Restore production data.
4. Verify staff access on the LAN.
5. Add Cloudflare Tunnel.
6. Move to `naivawasco-infra/compose/*.yml` only when you are ready for image-based staging/production deployment.

## 3. Prepare The Ubuntu Server

Recommended baseline:

- Ubuntu Server 24.04 LTS
- 4 CPU cores minimum
- 8 GB RAM minimum
- static LAN IP

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

Install Docker Engine and the Compose plugin using Docker's official Ubuntu instructions, then verify:

```bash
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

For LAN-only use, allow the frontend port from the LAN:

```bash
sudo ufw allow from 192.168.0.0/16 to any port 8080 proto tcp
```

If you will use Cloudflare Tunnel, do not open public inbound ports `80`, `443`, `8000`, or `8080`.

## 4. Clone The Repository

Choose a server path, then clone the monorepo:

```bash
sudo mkdir -p /opt/naivawasco
sudo chown -R deploy:deploy /opt/naivawasco
cd /opt/naivawasco
git clone <your-monorepo-url> app
cd /opt/naivawasco/app
```

## 5. Configure Environment

Copy the root Docker environment template:

```bash
cp .env.docker.example .env
```

Edit `.env` and set at least:

```env
POSTGRES_PASSWORD=<long-random-password>
DJANGO_SECRET_KEY=<long-random-secret>
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,<SERVER_LAN_IP>
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,http://<SERVER_LAN_IP>:8080
FRONTEND_PORT=8080
BACKEND_PORT=8000
```

Notes:

- The root Docker deployment uses the internal PostgreSQL container at service name `db`.
- The Compose files already set `DATABASE_URL` correctly for this internal database path.
- Keep `DJANGO_DEBUG=False` on any shared server.

If mobile sync should run on the server, also set:

```env
MOBILE_SUPABASE_DATABASE_URL=<mobile-supabase-pooler-url>
MOBILE_SUPABASE_URL=<mobile-supabase-url>
MOBILE_SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
MOBILE_SUPABASE_DEFAULT_PASSWORD=<temporary-password-if-needed>
MOBILE_SYNC_INTERVAL=10
```

## 6. Start The LAN Deployment

From the repository root:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Open:

```text
http://<SERVER_LAN_IP>:8080
http://<SERVER_LAN_IP>:8080/admin
http://<SERVER_LAN_IP>:8080/api
```

The frontend Nginx container proxies `/api`, `/admin`, and `/static` to the backend container. Staff should normally use only the frontend URL.

## 7. Restore Existing Data

Create a PostgreSQL custom dump from the current database:

```bash
pg_dump -h 127.0.0.1 -U postgres -d naivawasco_local -Fc -f backups/naivawasco_local.dump
```

Copy that dump into the server repository `backups/` directory, then restore:

```bash
docker compose exec db pg_restore -U postgres -d naivawasco_local --clean --if-exists /backups/naivawasco_local.dump
docker compose restart backend mobile-sync
```

Verify:

- login works
- admin works
- production dashboards return data
- distribution dashboards return data
- incidents load
- metering assignments load

## 8. Add Cloudflare Tunnel

After LAN validation, create a Cloudflare-managed tunnel and run the `cloudflared` connector through Docker Compose.

For the image-based staging/production path, the ready-made Compose files are:

- `naivawasco-infra/compose/docker-compose.prod.yml`
- `naivawasco-infra/compose/docker-compose.staging.yml`

Recommended public hostnames:

```text
https://app.your-domain.com
https://staging.your-domain.com
```

Both should route to:

```text
http://frontend:80
```

Use Cloudflare Access to protect:

```text
https://app.your-domain.com/admin/*
https://staging.your-domain.com/*
```

## 9. When To Move To naivawasco-infra

Stay on the root `docker-compose.yml` when:

- you are validating the first server
- you are building directly on the server
- you do not yet have GHCR image publishing

Move to `naivawasco-infra` when:

- you want staging and production separation
- you want prebuilt backend/frontend images
- you want GitHub Actions deployment workflows
- you want the Cloudflare tunnel defined as part of the production Compose stack

## 10. Definition Of Ready

The documentation is sufficient for a server clone when all of these are true:

- the server can clone this monorepo
- `.env` is created from `.env.docker.example`
- `docker compose up -d --build` works from the repo root
- the database restore command works against the Docker Postgres container
- the LAN URL works from another machine
- the Cloudflare hostname can be layered on after LAN validation
