# Local Production Docker Deployment

This setup runs the NAIVAWASCO web system inside the organization network. For public access, prefer Cloudflare Tunnel with the `docker-compose.cloudflare.yml` override so the host does not publish `8000` or `8080`.

- PostgreSQL database container
- Django backend container
- React frontend served by Nginx
- Expo mobile app access through the Django API

For the canonical "clone this repo to a fresh server and deploy it" runbook, start with `docs/server_clone_and_deploy.md`.

For the full phased hosting plan, including CI/CD, staging/production Compose, backups, monitoring, and go-live checks, see `docs/local_server_hosting_roadmap.md`.

## 1. Prepare Environment

Copy the example environment file:

```powershell
Copy-Item .env.docker.example .env
```

Edit `.env` and set:

- `POSTGRES_PASSWORD`
- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CORS_ALLOWED_ORIGINS`

Use the production server LAN IP in the host/origin values for LAN fallback only, for example:

```env
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.2.100
DJANGO_CORS_ALLOWED_ORIGINS=http://192.168.2.100:8080
```

## 2. Build And Start

From the repository root:

```powershell
docker compose up -d --build
```

Open the frontend from another machine on the same network if you are using the LAN fallback:

```text
http://SERVER_LAN_IP:8080
```

The backend API is also exposed at:

```text
http://SERVER_LAN_IP:8000/api
```

The frontend proxies `/api`, `/admin`, and `/static` through Nginx, so staff should normally use only port `8080`.

For Cloudflare Tunnel deployments, use the override file so Docker does not publish either host port:

```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml --profile cloudflare up -d
```

## 3. Load Existing Local PostgreSQL Data

Create a backup from the current local PostgreSQL database:

```powershell
pg_dump -h 127.0.0.1 -U postgres -d naivawasco_local -Fc -f backups\naivawasco_local.dump
```

Copy the dump to the server under the repository `backups` folder, then restore into the Docker database:

```powershell
docker compose exec db pg_restore -U postgres -d naivawasco_local --clean --if-exists /backups/naivawasco_local.dump
```

After restoring, restart the backend:

```powershell
docker compose restart backend
```

## 4. Useful Commands

View logs:

```powershell
docker compose logs -f backend
docker compose logs -f frontend
```

Run Django commands:

```powershell
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py check
```

Stop the system:

```powershell
docker compose down
```

Stop and remove database data:

```powershell
docker compose down -v
```
