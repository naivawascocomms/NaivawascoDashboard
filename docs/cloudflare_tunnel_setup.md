# Cloudflare Tunnel Setup

Last updated: 2026-07-03

Use this after the repo has been merged into one monorepo and the server can start the Docker stack locally. This guide assumes you want tunnel-only public access, meaning Docker does not publish `8000` or `8080` on the host.

## 1. Server Prerequisites

Before touching Cloudflare:

- The server has the merged source code.
- `.env` exists at the repository root, copied from `.env.docker.example`.
- `CLOUDFLARE_TUNNEL_TOKEN` is ready to paste into `.env`.
- `DJANGO_ALLOWED_HOSTS` includes your public hostname.
- `DJANGO_CORS_ALLOWED_ORIGINS` includes your public HTTPS origin.
- `DJANGO_CSRF_TRUSTED_ORIGINS` includes your public HTTPS origin.

Example production values:

```env
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,app.naivawasco.online
DJANGO_CORS_ALLOWED_ORIGINS=https://app.naivawasco.online
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.naivawasco.online
CLOUDFLARE_TUNNEL_TOKEN=<cloudflare-tunnel-token>
```

## 2. Start The Tunnel-Only Stack

From the repository root:

```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml --profile cloudflare up -d
```

This starts:

- `db`
- `backend`
- `frontend`
- `cloudflared`

It does not publish `8000` or `8080` on the host.

## 3. Create The Tunnel In Cloudflare

In the Cloudflare dashboard:

1. Open **Zero Trust**.
2. Go to **Networks** or **Access > Tunnels** depending on the UI version.
3. Choose **Create tunnel**.
4. Select **Cloudflared** as the connector.
5. Name the tunnel, for example `naivawasco-prod`.
6. Copy the tunnel token.
7. Put the token in the server `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
8. Restart the tunnel container if needed:

```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml --profile cloudflare up -d
```

## 4. Publish The Public Hostname

Create a public hostname route:

```text
Hostname: app.naivawasco.online
Service:  http://frontend:80
```

Use the same route for both the web UI and the Django API because the frontend proxies `/api`, `/admin`, and `/static` internally.

If you are using a staging environment, create a separate hostname:

```text
Hostname: staging.naivawasco.online
Service:  http://frontend:80
```

## 5. Protect Admin

Add Cloudflare Access rules for admin and staging:

```text
Protect: https://app.naivawasco.online/admin/*
Allow: approved admin emails only
```

For staging:

```text
Protect: https://staging.naivawasco.online/*
Allow: internal staff/admin emails only
```

## 6. Verify

After saving the tunnel route:

1. Open `https://app.naivawasco.online`.
2. Confirm the frontend loads.
3. Confirm `https://app.naivawasco.online/api/` responds.
4. Confirm `/admin` redirects to login.
5. Confirm Cloudflare Access prompts only where expected.

If the site fails:

- Check `docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml --profile cloudflare logs -f cloudflared`.
- Check `DJANGO_ALLOWED_HOSTS` and the CORS/CSRF hostnames.
- Confirm the tunnel token is correct.
