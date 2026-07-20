# Agents.md

This file provides guidance to coding agents working with code in this repository.

## Project Overview

NAIVAWASCO is a water utility management system for monitoring production, distribution, metering, incidents, finance, and source attribution. It is a multi-application repository:

- `naivawass_dashboard/` - Django REST Framework backend
- `production-pulse/` - React/TypeScript web frontend
- `meter-reading-mobile/` - Expo React Native Android app for field meter readings and incidents

The web system and mobile app use Django/PostgreSQL as the source of truth. The mobile app signs in with Django JWT auth and calls the backend API directly.

## Development Commands

### Frontend (`production-pulse/`)

```bash
npm run dev        # Start Vite dev server on port 8080
npm run build      # Production build
npm run build:dev  # Development-mode build
npm run lint       # Run ESLint
npm run preview    # Preview production build
```

Environment: set `VITE_API_URL` to override the backend base URL. It defaults to `http://127.0.0.1:8000/api`. In Docker, the frontend is built with `VITE_API_URL=/api` and Nginx proxies API traffic.

### Backend (`naivawass_dashboard/`)

```bash
# Activate virtualenv first
venv\Scripts\activate.bat          # Windows CMD
# or: source venv/Scripts/activate # Windows Git Bash

python manage.py runserver         # Start API server on port 8000
python manage.py migrate           # Apply migrations
python manage.py makemigrations    # Create migrations after model changes
python manage.py test              # Run tests
python manage.py check             # Validate Django configuration
python manage.py createsuperuser   # Create admin user
```

Current `requirements.txt` includes Django 6.0, DRF, SimpleJWT, django-filter, django-cors-headers, psycopg, gunicorn, and whitenoise. Use PostgreSQL; `DATABASE_URL` is required and the backend does not fall back to SQLite.

Typical local database URL:

```text
postgresql://postgres:<local-password>@127.0.0.1:5432/naivawasco_local
```

To recreate or reload the local PostgreSQL database from an exported Django fixture:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\migrate_to_local_postgres.ps1 -SkipExport -ExportFile local_postgres_export_utf8.json
```

### Mobile App (`meter-reading-mobile/`)

```bash
npm run start      # Expo start
npm run android    # Start on Android
npm run web        # Expo web
npm run typecheck  # TypeScript check
```

The mobile app uses Expo SDK 54, React 19, React Native 0.81, AsyncStorage, SecureStore, and Expo Location. Configure:

```env
EXPO_PUBLIC_API_BASE_URL=http://<backend-host>:8000/api
```

The Android app must never contain backend database credentials or server secrets.

### Docker

From the repository root:

```powershell
Copy-Item .env.docker.example .env
docker compose up -d --build
```

Docker runs PostgreSQL, Django/Gunicorn, and the React frontend through Nginx. Useful commands:

```powershell
docker compose logs -f backend
docker compose logs -f frontend
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
docker compose down
```

## Backend Architecture

The Django project is `dashboard`. API roots are mounted in `dashboard/urls.py`:

- `api/metering/`
- `api/production/`
- `api/distribution/`
- `api/incidents/`
- `api/finance/`
- `api/water-balance/`

Authentication is JWT via SimpleJWT:

- `POST /api/token/`
- `POST /api/token/refresh/`
- `POST /api/token/blacklist/`

Access tokens last 30 minutes. Refresh tokens last 7 days. Refresh rotation and blacklist-after-rotation are enabled. DRF defaults to `IsAuthenticated`, DjangoFilterBackend, SearchFilter, OrderingFilter, and page-number pagination with a page size of 50.

Settings load `naivawass_dashboard/.env` manually. Important environment variables:

- `DATABASE_URL` - required PostgreSQL URL
- `DATABASE_CONN_MAX_AGE` - defaults to 60
- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG`
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CORS_ALLOWED_ORIGINS`

The backend timezone is `Africa/Nairobi`. Static files use WhiteNoise compressed manifest storage.

### Django Apps

- `metering` - canonical shared water and energy meters, daily readings, user metering profiles, production/distribution meter mappings, field reading assignments, approval delegation, and mobile sync IDs.
- `production` - production regions, sites, sources, legacy production meters/readings, production targets, daily/monthly production records, cost configuration, water quality tests, and company monthly summaries.
- `distribution` - regions, zones, DMAs, supply configuration, billing cycles, zone billing cycles, customer billing, daily/monthly/regional distribution, transmission loss, global NRW, and sales/customer-care workbook dashboard data.
- `incidents` - production/distribution incident reports, assignments, status transitions, comments, mobile external IDs, and incident summaries.
- `finance` - workbook-backed finance reports, sections, metrics, and monthly values.
- `water_balance` - production-to-zone allocation rules and configurable source-attribution models using nodes, rules, and node inputs.

### Registered Routes

#### Metering

| Route | ViewSet |
|---|---|
| `water-meters/` | WaterMeterViewSet |
| `energy-meters/` | EnergyMeterViewSet |
| `user-profiles/` | UserProfileViewSet |
| `water-meter-readings/` | WaterMeterReadingViewSet |
| `energy-meter-readings/` | EnergyMeterReadingViewSet |
| `meter-reading-assignments/` | MeterReadingAssignmentViewSet |
| `production-water-assignments/` | ProductionWaterMeterAssignmentViewSet |
| `production-energy-assignments/` | ProductionEnergyMeterAssignmentViewSet |
| `distribution-water-assignments/` | DistributionWaterMeterAssignmentViewSet |

#### Production

| Route | ViewSet |
|---|---|
| `regions/` | RegionViewSet |
| `production-sites/` | ProductionSiteViewSet |
| `water-sources/` | WaterSourceViewSet |
| `meters/` | MeterViewSet |
| `meter-readings/` | MeterReadingViewSet |
| `production-targets/` | ProductionTargetViewSet |
| `daily-production/` | DailyProductionViewSet |
| `monthly-production/` | MonthlyProductionViewSet |
| `water-quality-tests/` | WaterQualityTestViewSet |
| `company-summary/` | CompanyMonthlySummaryViewSet |

#### Distribution

| Route | ViewSet |
|---|---|
| `regions/` | DistributionRegionViewSet |
| `zones/` | ZoneViewSet |
| `dmas/` | DMAViewSet |
| `meters/` | DistributionMeterViewSet |
| `meter-readings/` | DistributionMeterReadingViewSet |
| `billing-cycles/` | BillingCycleViewSet |
| `zone-billing-cycles/` | ZoneBillingCycleViewSet |
| `customer-billing/` | CustomerBillingDataViewSet |
| `daily-distribution/` | DailyDistributionViewSet |
| `monthly-distribution/` | MonthlyDistributionViewSet |
| `regional-distribution/` | RegionalDistributionViewSet |
| `transmission-loss/` | TransmissionLossViewSet |
| `global-nrw/` | GlobalNRWPerformanceViewSet |
| `commercial-dashboard-reports/` | CommercialDashboardReportViewSet |
| `commercial-dashboard-sections/` | CommercialDashboardSectionViewSet |
| `commercial-dashboard-kpis/` | CommercialDashboardKPIViewSet |
| `commercial-dashboard-monthly-values/` | CommercialDashboardMonthlyValueViewSet |
| `commercial-dashboard-snapshots/` | CommercialDashboardSnapshotViewSet |

#### Other Apps

| API Root | Route | ViewSet |
|---|---|---|
| `incidents/` | `incidents/` | IncidentViewSet |
| `incidents/` | `comments/` | IncidentCommentViewSet |
| `incidents/` | `users/` | IncidentUserViewSet |
| `finance/` | `reports/` | FinanceReportViewSet |
| `finance/` | `sections/` | FinanceSectionViewSet |
| `finance/` | `metrics/` | FinanceMetricViewSet |
| `finance/` | `monthly-values/` | FinanceMonthlyValueViewSet |
| `water-balance/` | `allocation-rules/` | ProductionZoneAllocationRuleViewSet |
| `water-balance/` | `nodes/` | WaterBalanceNodeViewSet |
| `water-balance/` | `models/` | WaterBalanceModelViewSet |
| `water-balance/` | `rules/` | WaterBalanceRuleViewSet |
| `water-balance/` | `node-inputs/` | WaterBalanceNodeInputViewSet |

### Notable Custom Actions

- `metering/user-profiles/me/` - current user's metering profile
- `metering/water-meter-readings/bulk_create/` and `submit/`
- `metering/energy-meter-readings/bulk_create/` and `submit/`
- `metering/meter-reading-assignments/mine/` and `today/`
- `metering/meter-reading-assignments/pending_approvals/`
- `metering/meter-reading-assignments/approve_reading/`
- `metering/meter-reading-assignments/bulk_approve/`
- `metering/meter-reading-assignments/{id}/delegate_approval/`
- `production/regions/{id}/production_sites/`
- `production/production-sites/{id}/water_sources/`, `meters/`, and `monthly_performance/`
- `production/water-sources/{id}/meters/`
- `production/meters/{id}/readings/` and `latest_reading/`
- `production/meter-readings/bulk_create/` and `validate_readings/`
- `production/daily-production/by_period/`, `by_date_range/`, and `validate_records/`
- `production/monthly-production/fy_site_totals/`, `dashboard_summary/`, `target_comparison/`, `finalize_records/`, and `{id}/comparison_with_previous/`
- `production/water-quality-tests/compliance_summary/`
- `distribution/regions/{id}/zones/`
- `distribution/zones/{id}/performance/`
- `distribution/billing-cycles/current_cycle/`
- `distribution/zone-billing-cycles/sync_regional/` and `recalculate_month/`
- `distribution/daily-distribution/analysis/`
- `distribution/monthly-distribution/dashboard/`, `fy_trend/`, and `reconciliation/`
- `distribution/commercial-dashboard-reports/{id}/dashboard/`
- `incidents/incidents/summary/`, `assigned_to_me/`, `{id}/update_status/`, and `{id}/add_comment/`
- `incidents/users/me/`
- `finance/reports/{id}/dashboard/`
- `water-balance/allocation-rules/source-allocations/`
- `water-balance/allocation-rules/source-attributions/`
- `water-balance/allocation-rules/source-attributions-by-zone-cycle/`

### Model and Business Logic Conventions

Keep derived calculations in models or shared services. Do not duplicate them in views or frontend code.

- Shared metering is canonical. Prefer `metering.WaterMeter`, `metering.EnergyMeter`, `WaterMeterReading`, `EnergyMeterReading`, and assignment models for new meter work. Legacy production/distribution meter models still exist for compatibility.
- Water and energy meter readings are once per meter per date in `metering`, and `consumption` is calculated as `current_reading - previous_reading` when a previous reading exists.
- Meter-reading assignments enforce role, scope, date-window, and meter-mapping rules in `clean()`/`save()`. Production supervisors assign production-site meters; zonal officers assign zone meters.
- `ProductionSite.production_equals_supply` makes production equal supply and sets production loss to zero for that site.
- Daily/monthly production derive `water_received_m3` for Water Works (`WWS`) when supplied water exceeds abstracted water.
- Production availability is based on supplied water when `water_supplied_m3 > 0`; otherwise it uses `water_abstracted_m3 + water_received_m3 - production_loss_m3`.
- Monthly production derives month start/end dates, total power, cost rollups, power efficiency, solar percentage, loss percentage, and realization metrics. Power costs use the active `ProductionCostConfig`.
- Distribution NRW: `nrw_m3 = volume_supplied_m3 - volume_billed_m3`; `nrw_percentage = nrw_m3 / volume_supplied_m3 * 100`.
- Monthly NRW realization is inverted because lower NRW is better: `nrw_target_percentage / nrw_percentage * 100`.
- `ZoneBillingCycle` is the authoritative per-zone meter-reading period and validates overlapping cycles.
- `CustomerBillingData` and `MonthlyDistribution` can derive/create the regional `BillingCycle` from a `ZoneBillingCycle`.
- Transmission loss: production availability minus distribution availability, expressed as a percentage of production availability.
- Global NRW: production water available for sale minus volume billed to customers.
- Incidents validate that production incidents link only to production sites and distribution incidents link only to zones. Resolved incidents set `resolved_at`; reopening clears it.
- Water-balance allocation and source-attribution models are reporting/configuration tools. They explain source mix for already-calculated zone supply and should not change official meter readings or production/distribution calculations.

### Key Uniqueness Constraints

- `metering.WaterMeter.meter_number` and `metering.EnergyMeter.meter_number` are unique.
- `metering.WaterMeterReading`: `(water_meter, reading_date)`
- `metering.EnergyMeterReading`: `(energy_meter, reading_date)`
- `metering.ProductionWaterMeterAssignment`: `(water_meter, production_site, water_source, assignment_role)`
- `metering.ProductionEnergyMeterAssignment`: `(energy_meter, production_site, assignment_role)`
- `metering.MeterReadingAssignment`: conditional unique constraints for production water, production energy, and zone water assignments per assignee.
- `production.WaterSource`: `(production_site, code)`
- `production.MeterReading`: `(meter, reading_date, reading_time)`
- `production.ProductionTarget`: `(production_site, year, month)`
- `production.DailyProduction`: `(production_site, production_date)`
- `production.MonthlyProduction`: `(production_site, year, month)`
- `production.CompanyMonthlySummary`: `(year, month)`
- `distribution.BillingCycle`: `(region, year, month)`
- `distribution.ZoneBillingCycle`: `(zone, year, month)`
- `distribution.CustomerBillingData`: `(zone, billing_cycle)`
- `distribution.DailyDistribution`: `(zone, distribution_date)`
- `distribution.MonthlyDistribution`: `(zone, billing_cycle)`
- `distribution.RegionalDistribution`: `(region, billing_cycle)`
- `distribution.TransmissionLoss`: `(billing_cycle, production_region)`
- `distribution.GlobalNRWPerformance`: `(billing_cycle)`
- `distribution.CommercialDashboardSection`: `(report, title)`
- `distribution.CommercialDashboardKPI`: `(report, display_order)`
- `distribution.CommercialDashboardMonthlyValue`: `(kpi, month)`
- `distribution.CommercialDashboardSnapshot`: `(kpi, snapshot_year, snapshot_month)`
- `finance.FinanceReport`: `(name, fiscal_year_start)`
- `finance.FinanceSection`: `(report, title)`
- `finance.FinanceMetric`: `(report, code)`
- `finance.FinanceMonthlyValue`: `(metric, year, month)`

### Import, Seed, and Sync Commands

Production:

```bash
python manage.py seed_reference_data
python manage.py seed_real_production_data --year 2025 --months 12
python manage.py seed_pseudo_meter_readings
python manage.py seed_meter_reading_history
python manage.py import_production_excel
python manage.py import_dashboard_excel
python manage.py import_bulk_meters
python manage.py map_production_water_meter_assignments
python manage.py sync_production_site_metering
```

Distribution:

```bash
python manage.py seed_production_structure
python manage.py sync_distribution_structure
python manage.py sync_distribution_shared_metering
python manage.py map_distribution_meters_phase1
python manage.py populate_distribution_test_configuration
python manage.py import_distribution_dashboard_historical
python manage.py import_sales_cc_dashboard
```

Metering:

```bash
python manage.py import_water_meter_list
python manage.py refresh_meter_display_names
python manage.py seed_shared_meter_history
```

Finance:

```bash
python manage.py import_finance_dashboard
```

## Frontend Architecture

`production-pulse/` is a Vite React app using TypeScript, React Query, Axios, shadcn/ui, Radix UI, Tailwind CSS, Recharts, lucide-react, and React Router.

Key structure:

- `src/pages/` - Route-level and major dashboard components
- `src/components/` - reusable UI components, including shadcn/ui wrappers
- `src/components/metering/` - assignment and validation managers
- `src/components/production/`, `distribution/`, `finance/`, `filters/` - dashboard-specific components
- `src/services/` - all API calls
- `src/hooks/` - React Query hooks
- `src/types/` - TypeScript API/domain types
- `src/data/` - static/mock dashboard data still used by some views
- `@` path alias resolves to `src/`

TypeScript is intentionally relaxed (`strict: false`, `noImplicitAny: false`, `strictNullChecks: false`). Do not tighten compiler settings without a broader review.

### Routing and Layout

`App.tsx` defines:

- `/login` - public login page
- `/` - protected main application
- `/home` - redirects to `/`
- `*` - not found

The protected `Index` page owns the in-app sidebar navigation. Active modules include Daily Analysis, Production, Water Distribution/Sales & CustCare, Revenue, Incidents, Reports, Data & Imports, and Water Balancing. Several sidebar entries are planned placeholders.

### API and Auth Conventions

`src/services/api.ts` defines the shared Axios client and token lifecycle:

- Access token key: `authToken`
- Refresh token key: `refreshToken`
- Adds `Authorization: Bearer <token>` to API requests
- Refreshes access tokens on 401 using a queue to avoid concurrent refresh races
- Calls `/token/blacklist/` on full logout when a refresh token exists
- Clears tokens and redirects to `/login` when refresh fails

Add or update API calls only in the relevant service file:

- `productionService.ts`
- `distributionService.ts`
- `meteringService.ts`
- `incidentService.ts`
- `financeService.ts`
- `waterBalanceService.ts`
- `authService.ts`

React Query hooks live in matching hook files. Query keys follow the existing pattern of `['resource-name', params]` or a stable tuple for scoped data. Mutations should invalidate the resource being changed and any dashboard/aggregate queries that depend on it.

Live dashboards commonly refetch every 60 seconds, including production dashboard, finance dashboard, incidents, and incident summary.

## Mobile App Architecture

`meter-reading-mobile/` is an Expo app for Android field workflows. It authenticates with Django JWT and calls the Django API directly.

Key structure:

- `App.tsx` - wraps the app in `AuthProvider` and switches between login and the main app
- `src/auth/AuthProvider.tsx` - Django JWT auth state
- `src/api/client.ts` - shared backend API client and token refresh handling
- `src/api/authApi.ts`, `meteringApi.ts`, `incidentsApi.ts` - backend data access for auth, readings, and incidents
- `src/features/readings/` - login, task list, reading form, pending sync, settings, and incidents screens
- `src/storage/pendingReadings.ts` - AsyncStorage retry queue for failed submissions
- `src/storage/pendingIncidentActions.ts` - AsyncStorage retry queue for failed incident actions
- `src/types/` - mobile metering and incident types

Mobile workflow:

- Field staff sign in with Django username/password.
- The app loads assigned water/energy meter-reading tasks for the current day.
- Submissions go directly to Django API endpoints.
- Failed submissions are queued locally and retried from the Sync tab.
- Assigned incidents can be viewed and updated through the backend API.
- Failed incident reports, comments, status changes, and assignment updates are queued locally and retried from the Sync tab.

## Cross-App Data Flow

- Django is the operational reporting backend for the web dashboards.
- Django/PostgreSQL is the shared backend for web dashboards and mobile field capture.
- `metering` owns canonical shared physical meters and reading assignments.
- Production and distribution dashboards consume shared metering data through sync/import logic and model rollups.
- Water-balance source attribution is explanatory/reporting configuration layered on top of production and distribution data.
- Finance and commercial dashboards are workbook-backed, with import commands populating structured report/metric/value tables.

## Key Conventions

- Use DRF serializers and services for API shapes; avoid ad hoc JSON assembly in components.
- Keep model-derived business calculations in model methods or backend services.
- Preserve legacy production/distribution meter APIs unless deliberately migrating a feature to shared `metering`.
- Region in distribution means where water goes, not the physical production location. NIP is Southern region.
- Tailwind uses class-based dark mode and design tokens in `src/index.css`.
- The frontend was scaffolded via Lovable.dev; `lovable-tagger` is active in Vite development mode.
- This workspace may not be a git repository at the top level. Check before using git-based workflows.
