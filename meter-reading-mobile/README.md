# NAIVAWASCO Meter Reading Mobile

Expo React Native Android app for daily field meter readings. The app now signs in to the Django backend with JWT and uses the backend API as the source of truth.

## Scope

- Sign in with Django username/password through `/api/token/`.
- Load assigned meter-reading tasks from `/api/metering/meter-reading-assignments/today/`.
- Submit water and energy readings through the backend idempotent `submit/` actions.
- Queue failed reading submissions locally for retry.
- Queue failed incident reports, comments, status changes, and assignment updates locally for retry.
- Auto-retry queued readings and incident actions every 30 seconds while the app is open, and immediately when the app returns to the foreground.
- View, report, assign, comment on, and update incidents through `/api/incidents/`.

## Backend URL

Set the API base URL before starting Expo:

```env
EXPO_PUBLIC_API_BASE_URL=https://your-cloudflare-tunnel.example.com/api
```

If the value does not end with `/api`, the app appends `/api` automatically. For local Android emulator testing, use the host bridge instead of `127.0.0.1`:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000/api
```

For a physical phone, use the Cloudflare Tunnel HTTPS URL or a LAN-reachable server URL.

## Django Requirements

The backend must be reachable from the phone and must allow the tunnel host:

```env
DJANGO_ALLOWED_HOSTS=your-cloudflare-tunnel.example.com,127.0.0.1,localhost
DJANGO_CORS_ALLOWED_ORIGINS=https://your-cloudflare-tunnel.example.com
```

The Django users who sign in to the app need active metering profiles and active meter-reading assignments for the selected date.

## Run

```bash
cd meter-reading-mobile
npm install
npm run android
```

## Notes

- Reading submissions are idempotent by meter/date and cannot update validated readings.
- Pending readings and incident actions are stored locally with AsyncStorage and can be retried automatically or manually from the Sync tab.
- Auto-sync keeps retrying network/server failures. Validation failures stay in the Sync tab for correction.
- The app uses Django JWT and backend API endpoints directly.
