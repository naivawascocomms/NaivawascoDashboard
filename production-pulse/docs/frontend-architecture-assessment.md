# Production Pulse — Frontend Architecture Assessment

**Date:** 2026-07-18
**Scope:** `production-pulse/src` (dashboard web app only)
**Constraint:** Any restructure must not touch the API contract. All endpoint knowledge is confined to `src/services/*` — that layer is the boundary and stays as-is.

---

## 1. Current Architecture

### 1.1 Stack

| Concern | Choice |
|---|---|
| Build | Vite 5 + SWC, TypeScript 5.8 |
| UI framework | React 18, shadcn/ui (Radix primitives), Tailwind CSS 3 |
| Server state | TanStack React Query v5 |
| HTTP | Axios with JWT interceptors (`src/services/api.ts`) |
| Routing | react-router-dom v6 (barely used — see §2.1) |
| Charts | Recharts |
| Forms | react-hook-form + zod |
| Auth | DRF Simple JWT: access/refresh in `localStorage`, silent refresh with request queueing |

The project is a Lovable scaffold (`lovable-tagger`, package name still `vite_react_shadcn_ts`, version `0.0.0`).

### 1.2 Layering

The codebase follows a clean, consistent layer-per-concern structure — this is its main strength:

```
src/
├── App.tsx                  # Providers + 3 routes (/login, /, *)
├── pages/                   # 12 files — but only Index, Login, NotFound are routed
│   └── Index.tsx            # The real app shell: sidebar + module switcher
├── components/
│   ├── ui/                  # 47 shadcn primitives (generated)
│   ├── daily|production|distribution|finance|metering|filters/   # domain components
│   └── dashboard/           # LEGACY — mostly dead (see §2.4)
├── hooks/                   # React Query hooks per domain (useProduction, useFinance, …)
├── services/                # Axios service objects per domain — the API boundary
├── types/                   # Domain types + types/api.ts (1,001-line monolith)
├── data/                    # Mock data files — all dead code (see §2.4)
└── lib/utils.ts             # cn()
```

Data flow is uniform and correct: **page → domain hook (React Query) → domain service → `api` client → DRF backend**. No component calls axios directly. This is exactly the seam that makes a frontend restructure safe: pages and components can be reorganized freely without any endpoint being touched.

### 1.3 Navigation model

`App.tsx` defines only three routes. Everything else lives inside `pages/Index.tsx` (336 lines), which:

- renders the `SidebarProvider` shell (sidebar nav, sticky header with page title/subtitle),
- holds `useState<DashboardType>` with 15 module ids grouped as Technical / Distribution / Finance / Shared / Administration / Settings,
- switches modules with an `if`-chain in `renderContent()`,
- eagerly imports **all nine module pages** at the top of the file.

Modules marked `planned` (Sanitation, Propoor, Billing, Accounts, System Settings) render a placeholder card. `salesCustCare` currently renders the same `DistributionDashboard` component as `waterDistribution`.

### 1.4 Design system

`index.css` defines a complete HSL token set (water-blue palette, status colors `--success`/`--warning`/`--destructive`, gradients, shadows, dark sidebar tokens) plus component classes (`stat-card`, `glass-card`, `mono-value`). A full `.dark` token block exists. Fonts (Inter, JetBrains Mono) load from Google Fonts via CSS `@import`.

---

## 2. Discrepancies Requiring Attention

Ordered by impact. Items 2.1–2.3 change what users experience daily; the rest are hygiene/consistency debt that will slow every future feature.

### 2.1 Navigation is component state, not URLs — 🔴 highest impact
The active module lives in `useState` inside `Index.tsx`. Consequences:

- **No deep linking** — a user cannot bookmark or share "the Finance dashboard"; every link into the app lands on Daily Analysis.
- **Refresh loses context** — F5 resets to the default module and discards all filter state.
- **Back/forward buttons don't work** — a basic UX expectation on the web.
- The `/home` redirect and `NavLink.tsx` component suggest routing was intended and abandoned.

**Fix direction:** nested routes under a layout route (`/daily`, `/production`, `/distribution`, `/finance/revenue`, …) with `Index` becoming a layout that renders `<Outlet />`. Sidebar buttons become `NavLink`s. Zero API impact.

### 2.2 No code-splitting — every module ships on first paint
`Index.tsx` statically imports all nine module pages. `ProjectsDashboard.tsx` alone is 1,382 lines; Recharts is pulled in regardless of which module the user opens. Login should not pay for the Water Balance settings screen.

**Fix direction:** `React.lazy` + `Suspense` per module route (pairs naturally with 2.1).

### 2.3 Duplicated / competing page headers
The shell (`Index.tsx`) renders a sticky header with the module's title and subtitle. But:

- `ProductionDashboard`, `DistributionDashboard`, and `FinanceDashboard` **also** render the legacy `components/dashboard/Header.tsx`, which prints "NAIVAWASCO Dashboard — Production & Distribution Management System" a second time, with its own period pill and refresh button.
- `DailyAnalysis` renders its own third variant (inline `<h1>Daily Analysis</h1>` duplicating the shell header directly above it).

Users see the app's name/title twice on most screens, and the refresh/period controls appear in different places per module. **Fix direction:** delete `dashboard/Header`, keep the shell header as the single title bar, and standardize a "page toolbar" slot (filters + refresh) that each module fills.

### 2.4 Dead code from the mock-data era
Verified by import search — none of the following is referenced by any live code path:

| Dead asset | Notes |
|---|---|
| `src/data/dailyAnalysisData.ts` (470 lines) | unused |
| `src/data/distributionData.ts`, `financeData.ts`, `productionData.ts` | unused |
| `src/data/mockData.ts` | only imported by `DataInputForm`, itself unused |
| `src/components/dashboard/` — `KPICard`, `RegionCard`, `RegionFilter`, `NRWChart`, `TrendChart`, `ZoneTable`, `TabNavigation`, `DataInputForm` | unused (only `Header` is imported, and it should go per §2.3) |
| `src/components/NavLink.tsx` | unused |

~1,500+ lines of stale code that misleads anyone reading the repo into thinking mock data is still wired in. Safe to delete outright.

### 2.5 Five near-duplicate KPI card components
`DailyKPICard`, `ProductionKPICard`, `DistributionKPICard`, `FinanceKPICard`, and the dead `dashboard/KPICard` each reimplement the same card: label, big number, unit, status color, trend arrow, K/M number formatting. Inconsistencies that are visible on screen:

- `DailyKPICard` hardcodes `text-emerald-500` while the others use the `--success` token — two different greens on adjacent screens.
- Number formatting thresholds/precision differ per copy (`toFixed(1)` vs `toFixed(2)`, `toLocaleString` vs manual).
- `ProductionKPICard` infers semantics from the label string (`label.includes('Cost')`) — fragile.

**Fix direction:** one shared `<KpiCard>` (variants via props) + a shared `lib/format.ts` (`formatCompact`, `formatCurrency`, `formatPercent`) replacing the per-page `fmt`/`n` helper copies.

### 2.6 Monolithic page files
`ProjectsDashboard` 1,382 · `ProductionDashboard` 821 · `SalesCustomerCareSection` 749 · `WaterBalanceSettings` 743 · `DataEntry` 692 · `IncidentReporting` 690 lines. Each embeds private sub-components, tables, and duplicate helper functions (`fmt`, `pctStatus`, FY-month logic). The FY calendar logic (July–June financial year) in `ProductionDashboard` is business logic that belongs in a shared `lib/fiscalYear.ts` — other modules will need it.

### 2.7 Inconsistent loading / error / empty states
Three different patterns coexist: skeleton rows (`IncidentReporting`), plain "Loading…" text cards (`DailyAnalysis`), and spinner-gated whole pages (`ProjectsDashboard`). Error states are one-line messages with no retry action, and there is **no error boundary** anywhere — a render error in one module white-screens the whole shell. **Fix direction:** shared `<QueryStateGate>` (or per-module skeletons) + an error boundary per module route.

### 2.8 Dark mode is built but unreachable
Full `.dark` token set exists and `next-themes` is installed, yet no `ThemeProvider`/toggle is mounted (only `sonner.tsx` reads the theme). Meanwhile hardcoded colors (`text-emerald-500`, the amber/orange "solar" variant) will not adapt when dark mode is enabled. Either ship the toggle or remove the dead tokens — currently it's half-shipped.

### 2.9 Two menu items render the same dashboard
`Sales & CustCare` and `Water Distribution` both mount `DistributionDashboard`. A user clicking two differently-named menu items and landing on identical screens reads as a bug. If Sales/CustCare is meant to open the `SalesCustomerCareSection` view of that dashboard, pass the initial section (trivially expressed as a route param once 2.1 lands); otherwise mark it `planned`.

### 2.10 Type-safety gaps at the hook layer
`types/api.ts` is a well-typed 1,001-line monolith, but hooks undercut it: `useProductionSites(params?: any)` etc. — query params are untyped throughout `hooks/`. Also `useDailyAnalysis` lives in `useDistribution.ts` (wrong domain file). **Fix direction:** split `types/api.ts` by domain, type the param objects, move `useDailyAnalysis` into its own domain hook file. Pure TS-level change, no runtime/API impact.

### 2.11 Smaller items
- **React Query defaults scattered:** `new QueryClient()` has no `defaultOptions`; every hook re-declares `staleTime`/`refetchOnWindowFocus` inconsistently. Centralize in `App.tsx`.
- **Fonts via Google CDN `@import`:** render-blocking and fails offline — relevant for a utility ops dashboard on unreliable connectivity. Self-host with `@fontsource/*`.
- **Accessibility:** KPI status conveyed by color alone (add icon/text signal); icon-only buttons (refresh, sidebar trigger) lack `aria-label`s.
- **Naming drift:** kebab-case hooks (`use-mobile`, `use-toast`) vs camelCase (`useProduction`); `components/ui/use-toast.ts` duplicates `hooks/use-toast.ts`.
- **Package identity:** still `vite_react_shadcn_ts@0.0.0` with `lovable-tagger`; rename and drop the tagger if Lovable is no longer in the loop.

---

## 3. Suggested Restructure Sequence (frontend-only, API untouched)

1. ✅ **Delete dead code** (§2.4) — done 2026-07-18.
2. ✅ **Route-based navigation + lazy loading** (§2.1, §2.2) — done 2026-07-18. Routes live under the `Index` layout (`/daily`, `/production`, …), driven by `src/config/modules.ts`; module pages load via `React.lazy`.
3. ✅ **Single header/toolbar pattern** (§2.3) and Sales/CustCare split (§2.9) — done 2026-07-18. Legacy `dashboard/Header` deleted; pages use `src/components/layout/PageToolbar.tsx` (filters + period chip + refresh); `/sales-custcare` is its own page (`src/pages/SalesCustCare.tsx`).
4. ✅ **Shared KPI card + formatters + fiscal-year lib** (§2.5) — done 2026-07-18. `src/components/kpi/KpiCard.tsx` replaces the four per-domain cards; `src/lib/format.ts` and `src/lib/fiscalYear.ts` replace the per-page helper copies.
5. ✅ **Standardize loading/error states + error boundaries** (§2.7) — done 2026-07-18. `src/components/layout/QueryState.tsx` provides `LoadingState`/`ErrorState`/`EmptyState`; all main dashboards use them, error states have retry actions, and `src/components/layout/ModuleErrorBoundary.tsx` wraps the routed `<Outlet />` (keyed by pathname) so a module crash shows a recoverable card instead of white-screening the shell.
6. ✅ **Decompose the giant pages** (§2.6) — done 2026-07-18 for the two worst offenders:
   - `ProjectsDashboard` 1,382 → ~230 lines; tabs extracted to `components/projects/` (`ManagementTab`, `UpdatesTab`, `WorkspaceTab`, `shared.ts`), each owning its own forms/mutations.
   - `ProductionDashboard` 821 → ~490 lines; extracted `components/production/` (`KpiComparisonTable`, `WaterQualitySection`, `RegionalSection`, `SiteTables`, `shared.ts` with `pctRealized`/`pctStatus`/`pctColor`/`supplyForDisplay` and a typed `CompanySummaryLike` that removed most `as any` casts).
   - Remaining candidates for a later pass: `SalesCustomerCareSection` (749), `WaterBalanceSettings` (743), `DataEntry` (692), `IncidentReporting` (690).
7. ✅ **Hygiene pass** (§2.8, §2.11) — done 2026-07-18:
   - React Query defaults centralized on the `QueryClient` (`staleTime` 5 min, `refetchOnWindowFocus: false`, `retry: 1`); hooks may still override.
   - Fonts self-hosted via `@fontsource/inter` + `@fontsource/jetbrains-mono` (bundled by Vite); Google Fonts CDN `@import` removed — the dashboard now renders correctly offline.
   - **Dark mode shipped**: `next-themes` `ThemeProvider` mounted in `App.tsx` (`attribute="class"`, light default, system-aware) with a Sun/Moon toggle in the shell header.
   - tsconfig `target`/`lib` bumped to ES2021 — the `replaceAll` type errors are gone and `tsc --noEmit` now passes with **zero errors**.
   - `no-explicit-any` fixed in `Login.tsx` (typed axios error narrowing) and `WaterBalanceSettings.tsx` (typed select-helper props); a11y labels added (password visibility toggle, theme toggle); `KpiCard` announces status via `sr-only` text instead of color alone.
   - Identity: package renamed `vite_react_shadcn_ts@0.0.0` → `production-pulse@0.1.0`; `lovable-tagger` removed from deps and `vite.config.ts`; unused `components/ui/use-toast.ts` duplicate deleted. The kebab-case `use-mobile`/`use-toast` hook filenames are kept deliberately — they are shadcn's generated naming convention.

### Remaining known debt (not yet scheduled)

- **§2.10 typed hook params**: `hooks/useProduction|useDistribution|useMetering` still take `params?: any`; `types/api.ts` is still a 1,001-line monolith. Worth a dedicated pass.
- **Page decomposition round 2**: `SalesCustomerCareSection` (749), `WaterBalanceSettings` (743), `DataEntry` (692), `IncidentReporting` (690).
- Lint errors in shadcn-generated `components/ui/*` (empty-interface pattern) are upstream convention — leave or regenerate with newer shadcn.
- Pre-existing `react-hooks/exhaustive-deps` warnings in Finance/Projects/Sales sections.

Every step above operates on `pages/`, `components/`, `hooks/`, `types/`, and `App.tsx` only. `src/services/**` (endpoint paths, auth flow, interceptors) requires no edits at any step.
