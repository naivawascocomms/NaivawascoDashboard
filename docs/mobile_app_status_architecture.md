# Meter Reading Mobile App Status and Architecture

Last assessed: 2026-07-18

## Purpose

`meter-reading-mobile/` is an Expo React Native Android app for field meter reading and incident workflows. The checked-in app uses the Django backend API directly as its source of truth.

## Current Architecture

### Runtime Stack

- Expo SDK 54
- React 19
- React Native 0.81
- TypeScript with `strict: true`
- AsyncStorage for local JWT/session and retry queues
- Expo Location for incident GPS coordinate capture
- No navigation library; the app uses local React state for tab and screen switching

### Entry Point and App Shell

- `App.tsx` wraps the app in `AuthProvider`.
- `Root` shows a loading screen while session state is checked.
- Authenticated users enter `MeterReadingApp`.
- Unauthenticated users see `LoginScreen`.
- `MeterReadingApp` owns three bottom-level tabs:
  - `Home`
  - `Sync`
  - `Settings`
- The Home view has internal tabs:
  - Pending readings
  - Submitted readings
  - Approved readings
  - Incidents

### API Architecture

The API layer is a small typed wrapper around `fetch`, not Axios.

- `src/api/client.ts`
  - Resolves `EXPO_PUBLIC_API_BASE_URL`.
  - Defaults to `http://10.0.2.2:8000/api`.
  - Normalizes base URLs so values without `/api` get `/api` appended.
  - Adds `Authorization: Bearer <access-token>`.
  - Uses a 15-second request timeout.
  - Refreshes JWT access tokens through `/api/token/refresh/`.
  - Clears stored tokens if refresh fails.

- `src/api/authApi.ts`
  - Signs in through `/api/token/`.
  - Signs out by posting refresh token to `/api/token/blacklist/`, then clearing local tokens.

- `src/api/meteringApi.ts`
  - Loads the current metering profile from `/api/metering/user-profiles/me/`.
  - Loads today's assignments from `/api/metering/meter-reading-assignments/today/?date=YYYY-MM-DD`.
  - Submits readings through:
    - `/api/metering/water-meter-readings/submit/`
    - `/api/metering/energy-meter-readings/submit/`

- `src/api/incidentsApi.ts`
  - Lists assignable users from `/api/incidents/users/`.
  - Lists active incidents assigned to the current user from `/api/incidents/incidents/assigned_to_me/?active=true`.
  - Reports incidents through `/api/incidents/incidents/`.
  - Updates status through `/api/incidents/incidents/{id}/update_status/`.
  - Adds comments through `/api/incidents/incidents/{id}/add_comment/`.
  - Updates assignee through `PATCH /api/incidents/incidents/{id}/`.

### Local Storage Architecture

The app uses AsyncStorage for:

- JWT access token: `authToken`
- JWT refresh token: `refreshToken`
- Pending readings: `naivawasco.pendingReadings`
- Pending incident actions: `naivawasco.pendingIncidentActions`

Pending reading deduplication is by `meterType`, `meterId`, and `readingDate`. Pending incident actions are appended as separate queued actions.

### Offline and Retry Model

The app is not fully offline-first. It can only queue writes after a task or incident has already been loaded.

Current behavior:

- Reading submissions are attempted online first.
- If a reading submission fails due to network failure or server error, the reading is saved locally for retry.
- If a reading submission fails with a client-side/backend validation error, it is not queued.
- Incident reports, comments, status updates, and assignment changes follow the same retryable/non-retryable pattern.
- Retryable pending items are auto-synced:
  - once when the app opens
  - every 30 seconds while open
  - when the app returns to foreground
- The Sync tab also allows manual retry.
- Failed non-retryable queued items remain visible for correction, but the app does not currently provide an edit/correction flow from the Sync tab.

### Backend Coupling

The mobile app depends on Django as the live operational source of truth.

Relevant backend behavior confirmed in code:

- `metering/meter-reading-assignments/today/` builds one task per assigned water or energy meter for the requested date.
- The backend determines whether each task is `missing`, `submitted`, or `validated`.
- Reading submission is idempotent by meter/date because the serializers use `update_or_create`.
- Validated readings cannot be changed from the field app.
- Users can only submit readings for meters assigned to them for the selected date.
- Incident reports and comments support `mobile_external_id` for idempotency.
- Incident status changes currently do not accept or use a mobile idempotency key.

## Current Capabilities

### Authentication

Implemented:

- Django username/password login.
- JWT access and refresh token storage.
- Token refresh after `401` responses.
- Logout with refresh token blacklist attempt.
- Session restoration on app start through `/metering/user-profiles/me/`.

Limitations:

- Tokens are stored in AsyncStorage, not SecureStore.
- There is no biometric unlock or app-level PIN.
- There is no password reset/change workflow.
- There is no visible environment switcher; API URL is build/runtime environment driven.

### Meter Reading Tasks

Implemented:

- Shows field dashboard for the current local date.
- Loads assigned water and energy meter tasks for the authenticated user.
- Groups tasks into Pending, Submitted, and Approved tabs based on backend status.
- Shows meter label, scope, previous reading, previous reading date, and today's reading when present.
- Allows opening a reading form for any task shown in the lists.

Limitations:

- There is no date picker for past/future assignment days.
- There is no search, sorting, or filtering by site, zone, meter type, or route.
- There is no cached task list for cold-start offline use.
- Submitted and approved tasks can still be opened in the form, but backend validation controls what can actually change.
- There is no explicit route planning, sequence, or field itinerary support.

### Reading Submission

Implemented:

- Manual numeric readings for water and energy meters.
- Previous reading display.
- Client-side check that current reading is numeric.
- Client-side check that current reading is not less than previous reading.
- Estimated consumption preview.
- Optional notes.
- Backend idempotent submit action.
- Local queue for retryable failures.

Limitations:

- No photo capture or meter-image evidence.
- No GPS capture attached to meter readings.
- No QR/barcode scan for meter confirmation.
- No explicit anomaly confirmation workflow for unusually high/low consumption.
- No configurable reason codes for abnormal readings, inaccessible meters, damaged meters, or zero consumption.
- No support for "unable to read" submissions.
- No bulk task completion screen.
- No local draft save unless an online submit attempt fails.

### Pending Sync

Implemented:

- Shows queued readings and incident actions.
- Shows item status, created/submission details, and error text.
- Allows manual sync.
- Auto-sync retries retryable items.

Limitations:

- No edit, discard, or resolve action for failed queue items.
- No per-item retry control.
- No sync history or audit trail in the app.
- No conflict-resolution UI when backend data changes while a local item is queued.
- No network status indicator.

### Incidents

Implemented:

- Lists active incidents assigned to the signed-in user.
- Refreshes incident list every 15 seconds while open.
- Shows open, in-progress, and critical counts.
- Reports new production or distribution incidents.
- Uses fixed incident categories in the mobile code.
- Captures current GPS coordinates into the incident `location` field.
- Allows priority selection.
- Allows assigning a report to a backend user.
- Allows changing an incident assignee.
- Allows status transition to `in-progress` or `resolved`.
- Allows adding comments/updates.
- Queues retryable incident reports, comments, status updates, and assignment updates.
- Uses `mobile_external_id` for queued incident reports and comments.

Limitations:

- Incident report does not link to a `production_site` or `zone`; it only sends type/category/location text and assignee.
- Coordinates are stored as a plain string in `location`, not structured latitude/longitude fields.
- No photo/video attachments.
- No customer impact workflow beyond optional estimated m3 impact.
- No material/labor/action checklist.
- No SLA timer, escalation, or notification support.
- No map view.
- No incident search/filtering beyond the backend assigned-to-me active list.
- Status updates are queued without a mobile idempotency key, so repeated retry after partial success could duplicate the backend status-change comment.

### Settings

Implemented:

- Shows signed-in user display name.
- Shows role display.
- Shows resolved backend API URL.
- Provides sign out.

Limitations:

- No editable API URL inside the app.
- No device/app diagnostics screen.
- No version/build display.
- No sync queue management.
- No permissions status view.

## What Is Missing

### High Priority

- Full offline task cache for assigned work, so users can start the day without a live backend connection after an earlier sync.
- Secure token storage using Expo SecureStore instead of AsyncStorage.
- Meter reading evidence capture: photo, GPS, timestamp, and optionally barcode/QR meter verification.
- Failed queue item management: edit, retry, delete, and clear non-retryable validation failures.
- Reading exception workflow for inaccessible meters, damaged meters, no water/no power, meter stopped, or suspected tampering.
- Structured anomaly workflow for high/low consumption with reason and supervisor visibility.
- Incident asset selection/linkage to production sites and zones, not just free-text/GPS location.
- Idempotency for queued incident status changes and assignment updates, or backend-side duplicate-safe logic.

### Medium Priority

- Date picker/history for yesterday, missed tasks, and supervisor follow-up.
- Task filtering/search by meter number, site, zone, meter type, and status.
- Network state awareness and clearer offline/online UI.
- Local draft support before submit attempt.
- Role-aware screens for supervisors, zonal officers, and field readers.
- Supervisor approval/delegation workflows if the mobile app is expected to support validation.
- Push/local notifications for new assignments, incident assignment, and overdue work.
- App version, build, API diagnostics, and permission diagnostics in Settings.
- More complete incident lifecycle fields: resolution notes, materials used, action taken, and customer notification status.

### Lower Priority / Product Decisions

- Navigation library adoption if the app grows beyond the current tab/form structure.
- Theming/dark mode.
- Map-based incident and meter task display.
- Route optimization or ordered walk/drive sequence for meter reading.
- Background sync. Current sync runs while the app is open or returns to foreground.

## Key Risks and Observations

- The mobile app and backend now use a single Django/PostgreSQL source-of-truth path.
- AsyncStorage token storage is functional but weak for production authentication.
- The app is useful in unstable connectivity after data has loaded, but it is not enough for field teams who begin work fully offline.
- Incident status queueing can create duplicate comments if the backend accepts a status update and the client fails before removing the queued item.
- The mobile UI currently centralizes substantial workflow logic inside `MeterReadingApp.tsx` and `IncidentsScreen.tsx`; future feature growth will likely benefit from splitting sync orchestration, task state, and incident form logic into hooks/services.

## Verification Performed

- Inspected the mobile app source under `meter-reading-mobile/`.
- Cross-checked the Django metering and incident endpoints used by the app.
- Ran `npm run typecheck` in `meter-reading-mobile/`; it completed successfully.
