# Mobile API Mapping Roadmap

Last updated: 2026-07-18

## Objective

Keep the mobile app fully on the internally hosted Django API exposed through Cloudflare Tunnel. Testing is done locally on this computer first, then migrated to the live server.

## Target Architecture

The mobile app should use the same Django backend as the web dashboard.

```text
Mobile app
  -> HTTPS Cloudflare hostname /api
  -> frontend Nginx container
  -> backend Django container on backend:8000
  -> PostgreSQL
```

For local Android emulator testing:

```text
Mobile app
  -> http://10.0.2.2:8000/api
  -> local Django runserver
  -> local PostgreSQL
```

For local testing against the Docker frontend proxy:

```text
Mobile app
  -> http://10.0.2.2:8080/api
  -> local frontend Nginx container
  -> backend:8000
  -> local Docker PostgreSQL
```

For live deployment through Cloudflare Tunnel:

```text
Mobile app
  -> https://app.your-domain.com/api
  -> Cloudflare Tunnel
  -> frontend:80
  -> backend:8000
  -> production PostgreSQL
```

## Current State

### Already Django-backed

The checked-in `meter-reading-mobile/` app already calls Django directly:

- Login: `POST /api/token/`
- Refresh token: `POST /api/token/refresh/`
- Logout blacklist: `POST /api/token/blacklist/`
- Current metering user: `GET /api/metering/user-profiles/me/`
- Today tasks: `GET /api/metering/meter-reading-assignments/today/?date=YYYY-MM-DD`
- Water reading submit: `POST /api/metering/water-meter-readings/submit/`
- Energy reading submit: `POST /api/metering/energy-meter-readings/submit/`
- Assigned incidents: `GET /api/incidents/incidents/assigned_to_me/?active=true`
- Assignable incident users: `GET /api/incidents/users/`
- Incident create: `POST /api/incidents/incidents/`
- Incident status update: `POST /api/incidents/incidents/{id}/update_status/`
- Incident comment: `POST /api/incidents/incidents/{id}/add_comment/`
- Incident assignment: `PATCH /api/incidents/incidents/{id}/`

### Django-backed mobile path

The mobile app uses Django directly. The old separate mobile capture path and backend transfer command have been removed. `mobile_external_id` fields remain because they are still useful for idempotent mobile submissions.

## Phase 1: Local API Mapping

Goal: prove every mobile screen works against the local Django API before touching the live server.

### Backend setup

1. Confirm local PostgreSQL is running.
2. Configure `naivawass_dashboard/.env` with local PostgreSQL:

```env
DATABASE_URL=postgresql://postgres:<local-password>@127.0.0.1:5432/naivawasco_local
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,10.0.2.2
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
```

3. Run:

```powershell
cd naivawass_dashboard
venv\Scripts\activate.bat
python manage.py migrate
python manage.py check
python manage.py runserver 0.0.0.0:8000
```

### Mobile setup

Use this local API URL for Android emulator testing:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000/api
```

For a physical Android device on the same LAN, use the computer LAN IP instead:

```env
EXPO_PUBLIC_API_BASE_URL=http://<computer-lan-ip>:8000/api
```

Then run:

```powershell
cd meter-reading-mobile
npm install
npm run typecheck
npm run android
```

### Local acceptance checks

- User can log in with a Django username/password.
- App restores the session after restart.
- Settings shows the expected local API base URL.
- Today reading tasks load for a user with active assignments.
- Water reading can be submitted.
- Energy reading can be submitted.
- Duplicate submit for the same meter/date updates the unvalidated reading rather than creating a duplicate.
- Validated readings are rejected by the backend.
- App queues reading submissions when the local backend is stopped.
- Queued readings sync after the backend is restarted.
- Assigned incidents load.
- Incident report can be created.
- Incident comment can be added.
- Incident status can be changed.
- Incident assignment can be changed.
- Incident actions queue during backend outage and sync after recovery.

## Phase 2: Local Docker Proxy Test

Goal: prove the same `/api` path works through the frontend Nginx proxy, matching the live Cloudflare routing model.

1. Start the local Docker stack:

```powershell
docker compose up -d --build
```

2. Confirm the API is available through the frontend proxy:

```powershell
Invoke-WebRequest http://127.0.0.1:8080/api/
Invoke-WebRequest http://127.0.0.1:8080/admin/
```

3. Point the mobile app to:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080/api
```

4. Repeat the local acceptance checks from Phase 1.

Passing this phase means the mobile app is compatible with the same path shape used by Cloudflare Tunnel.

## Phase 3: Live Server Readiness

Goal: prepare the live server so the mobile app can call Django through the Cloudflare hostname.

### Live environment

In the live compose `.env`, ensure:

```env
DJANGO_ALLOWED_HOSTS=app.your-domain.com,localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=https://app.your-domain.com
CLOUDFLARE_TUNNEL_TOKEN=<cloudflare-tunnel-token>
```

The production infra compose currently publishes only the frontend service locally and exposes backend internally. That is correct because mobile traffic should enter through:

```text
https://app.your-domain.com/api
```

Cloudflare public hostname should route to:

```text
http://frontend:80
```

The frontend Nginx config already proxies:

- `/api/` to `http://backend:8000/api/`
- `/admin/` to `http://backend:8000/admin/`
- `/static/` to `http://backend:8000/static/`

### Live smoke checks

From any machine with internet access:

```bash
curl -I https://app.your-domain.com
curl -I https://app.your-domain.com/api/
curl -I https://app.your-domain.com/admin/
```

From the server:

```bash
cd /opt/naivawasco/prod
docker compose -p naivawasco-prod ps
docker compose -p naivawasco-prod logs --tail=100 backend
docker compose -p naivawasco-prod logs --tail=100 frontend
docker compose -p naivawasco-prod logs --tail=100 cloudflared
docker compose -p naivawasco-prod exec backend python manage.py check
```

## Phase 4: Mobile Live API Build

Goal: build/test the mobile app against the live Cloudflare API URL.

Set:

```env
EXPO_PUBLIC_API_BASE_URL=https://app.your-domain.com/api
```

Then run a live test build or Expo run:

```powershell
cd meter-reading-mobile
npm run typecheck
npm run android
```

Live acceptance checks:

- Login succeeds through Cloudflare.
- Token refresh works after access token expiry.
- Today tasks load over HTTPS.
- Reading submit writes to the live Django database.
- Incident report writes to the live Django database.
- Queued offline reading sync succeeds when connectivity returns.
- Queued incident report/comment/status/assignment sync succeeds when connectivity returns.
- Backend logs show Django API requests for mobile activity.

## Phase 5: Removed Legacy Mobile Sync

Goal: keep the operational path Django-only.

### Code and configuration cleanup

Completed cleanup:

- Removed the old mobile transfer service from root `docker-compose.yml`.
- Removed legacy mobile sync env vars from active compose/env examples.
- Removed the old backend mobile sync module and command.
- Removed the old mobile schema application script.

Do not remove existing `mobile_external_id` fields. They are useful for idempotency even with the Django-backed mobile app.

### Operational cleanup

- Remove legacy mobile sync secrets from live `.env` files.
- Confirm no cron/systemd job runs the old mobile sync command.
- Confirm Cloudflare Tunnel is the only public mobile API ingress.
- Update backup/restore documentation to describe only PostgreSQL as the mobile/web source of truth.

## Phase 6: Hardening After Cutover

These are not required for the first live mapping, but should follow soon after.

- Move mobile JWT storage from AsyncStorage to Expo SecureStore.
- Add an API health endpoint or use a lightweight authenticated profile check in Settings.
- Add app version/build display in Settings.
- Add online/offline state indicator.
- Add edit/delete controls for failed sync queue items.
- Add idempotency for incident status and assignment queued actions.
- Add structured GPS fields and optional photos for readings/incidents.
- Add a proper release profile for staging and production API URLs.

## Recommended Execution Order

1. Complete Phase 1 local direct-backend testing.
2. Complete Phase 2 local Docker proxy testing.
3. Confirm live Cloudflare `/api` smoke checks.
4. Build mobile app with `EXPO_PUBLIC_API_BASE_URL=https://app.your-domain.com/api`.
5. Test with one controlled field user and one test meter assignment.
6. Remove legacy mobile sync services and secrets.
7. Update old architecture docs so Django/PostgreSQL/Cloudflare is the only documented mobile path.
8. Start the hardening backlog.

## Decision Points Before Implementation

- Confirm the final live hostname for mobile API use.
- Decide whether staging will be required before production mobile rollout.
- Decide whether mobile releases should have separate staging and production build profiles.
- Decide whether field users need full cold-start offline task access in the first production release.
