# Architecture Snapshot

## Repository Map

| Module | Language | Symbols | Exported |
|--------|----------|---------|----------|
| `.` | python | 4 | 4 |
| `backend/prisma` | typescript | 20 | 0 |
| `backend/scripts` | typescript | 26 | 0 |
| `backend/src` | typescript | 15 | 0 |
| `backend/src/config` | typescript | 12 | 0 |
| `backend/src/controllers` | typescript | 177 | 0 |
| `backend/src/lib` | typescript | 24 | 0 |
| `backend/src/middleware` | typescript | 47 | 0 |
| `backend/src/models` | typescript | 198 | 0 |
| `backend/src/routes` | typescript | 43 | 0 |
| `backend/src/utils` | typescript | 31 | 0 |
| `backend/src/validators` | typescript | 31 | 0 |
| `backend/tests` | typescript | 6 | 0 |
| `backend/tests-legacy` | typescript | 131 | 1 |
| `frontend` | typescript | 2 | 2 |
| `frontend/src` | typescript | 0 | 0 |
| `frontend/src/admin` | typescript | 3 | 2 |
| `frontend/src/admin/components` | typescript | 6 | 6 |
| `frontend/src/admin/pages` | typescript | 24 | 10 |
| `frontend/src/app` | typescript | 12 | 9 |
| `frontend/src/components` | typescript | 49 | 22 |
| `frontend/src/components/ui` | typescript | 14 | 12 |
| `frontend/src/hooks` | typescript | 3 | 3 |
| `frontend/src/lib` | typescript | 52 | 26 |
| `frontend/src/pages` | typescript | 30 | 13 |

## Extraction Quality

- Files parsed: **162** / 238 seen (0 file(s) + 4 directory tree(s) skipped by ignore globs)
- Parse errors: 0

## Architecture Pattern

_No specific architecture pattern detected._

## Entry Points

- **main**: `backend/prisma.main` (backend/prisma/seed.js)
- **main**: `backend/scripts.main` (backend/scripts/create-admin.js)
- **main**: `backend/scripts.main` (backend/scripts/share.js)
- **main**: `backend/scripts.main` (backend/scripts/smoke.js)
57 routes, 15 shown:
- **route** GET `/admin/audit` (frontend/src/admin/pages/AdminAudit.jsx)
- **route** GET `/admin/dashboard` (frontend/src/admin/pages/Dashboard.jsx)
- **route** GET `/admin/items` (frontend/src/admin/pages/AdminItems.jsx)
- **route** GET `/admin/locations/areas` (frontend/src/admin/pages/AdminLocations.jsx)
- **route** GET `/admin/locations/cities` (frontend/src/admin/pages/AdminLocations.jsx)
- **route** GET `/admin/locations/colleges` (frontend/src/admin/pages/AdminLocations.jsx)
- **route** GET `/admin/reports` (frontend/src/admin/pages/AdminReports.jsx)
- **route** GET `/admin/settings` (frontend/src/admin/pages/AdminSettings.jsx)
- **route** GET `/admin/users` (frontend/src/admin/pages/AdminUsers.jsx)
- **route** GET `/api/health` (backend/src/app.js)
- **route** GET `/api` (backend/scripts/smoke.js)
- **route** GET `/auth/me` (frontend/src/lib/authService.js)
- **route** GET `/config` (frontend/src/app/ConfigProvider.jsx)
- **route** GET `/dashboard` (frontend/src/lib/dashboardService.js)
- **route** GET `/health` (frontend/src/admin/pages/Dashboard.jsx)
- … and 42 more (query_facts(kind="route") for all)

## Routes

| Method | Path | File | Type |
|--------|------|------|------|
| GET | `/admin/audit` | `frontend/src/admin/pages/AdminAudit.jsx` |  |
| POST | `/admin/categories` | `frontend/src/admin/pages/AdminCategories.jsx` |  |
| PATCH | `/admin/categories/{}` | `frontend/src/admin/pages/AdminCategories.jsx` |  |
| POST | `/admin/conditions` | `frontend/src/admin/pages/AdminConditions.jsx` |  |
| PATCH | `/admin/conditions/{}` | `frontend/src/admin/pages/AdminConditions.jsx` |  |
| GET | `/admin/dashboard` | `frontend/src/admin/pages/Dashboard.jsx` |  |
| GET | `/admin/items` | `frontend/src/admin/pages/AdminItems.jsx` |  |
| PATCH | `/admin/items/{}/moderation` | `frontend/src/admin/pages/AdminItems.jsx` |  |
| POST | `/admin/locations/areas` | `frontend/src/admin/pages/AdminLocations.jsx` |  |
| GET | `/admin/locations/areas` | `frontend/src/admin/pages/AdminLocations.jsx` |  |
| POST | `/admin/locations/cities` | `frontend/src/admin/pages/AdminLocations.jsx` |  |
| GET | `/admin/locations/cities` | `frontend/src/admin/pages/AdminLocations.jsx` |  |
| GET | `/admin/locations/colleges` | `frontend/src/admin/pages/AdminLocations.jsx` |  |
| POST | `/admin/locations/colleges` | `frontend/src/admin/pages/AdminLocations.jsx` |  |
| POST | `/admin/nav-links` | `frontend/src/admin/pages/AdminContent.jsx` |  |
| PATCH | `/admin/nav-links/{}` | `frontend/src/admin/pages/AdminContent.jsx` |  |
| PATCH | `/admin/nav-links/{}` | `frontend/src/admin/pages/AdminContent.jsx` |  |
| PATCH | `/admin/nav-links/{}` | `frontend/src/admin/pages/AdminContent.jsx` |  |
| GET | `/admin/reports` | `frontend/src/admin/pages/AdminReports.jsx` |  |
| PATCH | `/admin/reports/{}/review` | `frontend/src/admin/pages/AdminReports.jsx` |  |
| PUT | `/admin/settings` | `frontend/src/admin/pages/AdminSettings.jsx` |  |
| GET | `/admin/settings` | `frontend/src/admin/pages/AdminSettings.jsx` |  |
| POST | `/admin/social-links` | `frontend/src/admin/pages/AdminContent.jsx` |  |
| PATCH | `/admin/social-links/{}` | `frontend/src/admin/pages/AdminContent.jsx` |  |
| GET | `/admin/users` | `frontend/src/admin/pages/AdminUsers.jsx` |  |
| PATCH | `/admin/users/{}/role` | `frontend/src/admin/pages/AdminUsers.jsx` |  |
| PATCH | `/admin/users/{}/status` | `frontend/src/admin/pages/AdminUsers.jsx` |  |
| GET | `/api` | `backend/scripts/smoke.js` |  |
| GET | `/api/health` | `backend/src/app.js` |  |
| POST | `/auth/login` | `frontend/src/lib/authService.js` |  |
| GET | `/auth/me` | `frontend/src/lib/authService.js` |  |
| POST | `/auth/register` | `frontend/src/lib/authService.js` |  |
| GET | `/config` | `frontend/src/app/ConfigProvider.jsx` |  |
| GET | `/dashboard` | `frontend/src/lib/dashboardService.js` |  |
| GET | `/health` | `frontend/src/admin/pages/Dashboard.jsx` |  |
| GET | `/items` | `frontend/src/components/Experience.jsx` |  |
| POST | `/items` | `frontend/src/lib/itemService.js` |  |
| GET | `/items` | `frontend/src/lib/itemService.js` |  |
| GET | `/items` | `frontend/src/pages/Browse.jsx` |  |
| GET | `/items` | `frontend/src/pages/Home.jsx` |  |
| GET | `/items` | `frontend/src/pages/Home.jsx` |  |
| GET | `/items` | `frontend/src/pages/LatestListings.jsx` |  |
| GET | `/items/mine` | `frontend/src/lib/itemService.js` |  |
| GET | `/items/{}` | `frontend/src/lib/itemService.js` |  |
| PUT | `/items/{}` | `frontend/src/lib/itemService.js` |  |
| PATCH | `/items/{}/status` | `frontend/src/lib/itemService.js` |  |
| GET | `/locations/cities` | `frontend/src/lib/locationService.js` |  |
| GET | `/locations/cities/{}/areas` | `frontend/src/lib/locationService.js` |  |
| GET | `/locations/colleges` | `frontend/src/lib/locationService.js` |  |
| GET | `/locations/colleges/{}` | `frontend/src/lib/locationService.js` |  |
| GET | `/metrics` | `backend/src/app.js` |  |
| POST | `/requests` | `frontend/src/lib/requestService.js` |  |
| GET | `/requests/received` | `frontend/src/lib/requestService.js` |  |
| GET | `/requests/sent` | `frontend/src/lib/requestService.js` |  |
| PATCH | `/requests/{}` | `frontend/src/lib/requestService.js` |  |
| GET | `/stats` | `frontend/src/components/LiveIndex.jsx` |  |
| PUT | `/users/me/college` | `frontend/src/lib/locationService.js` |  |

## Dependency Rules

- `frontend/src/admin/components` -> `frontend/src/components/ui`
- `frontend/src/admin/pages` -> `frontend/src/components/ui`
- `frontend/src/admin` -> `frontend/src/admin/components`
- `frontend/src/admin` -> `frontend/src/admin`
- `frontend/src/admin` -> `frontend/src/app`
- `frontend/src/admin` -> `frontend/src/lib`
- `frontend/src/app` -> `frontend/src/components/ui`
- `frontend/src/components` -> `frontend/src/app`
- `frontend/src/components` -> `frontend/src/lib`
- `frontend/src/pages` -> `frontend/src/components/ui`
- `frontend/src` -> `frontend/src/app`
- `frontend/src` -> `frontend/src/hooks`
- `frontend/src` -> `frontend/src/lib`

## Critical Modules

| Module | Fan-In | Fan-Out | Criticality |
|--------|--------|---------|-------------|
| `frontend/src/components/ui` | 15 | 0 | high |
| `frontend/src` | 0 | 10 | high |
| `frontend/src/admin/pages` | 0 | 9 | medium |
| `frontend/src/app` | 6 | 2 | medium |
| `frontend/src/lib` | 6 | 0 | medium |
| `frontend/src/admin` | 1 | 4 | medium |
| `frontend/src/pages` | 0 | 3 | low |
| `frontend/src/admin/components` | 1 | 1 | low |
| `frontend/src/components` | 0 | 2 | low |
| `frontend/src/hooks` | 2 | 0 | low |

## Risk Zones

- **Cyclic dependency detected (2 modules)** (confidence: 100%): The following modules form a dependency cycle: backend/src/models -> backend/src/utils -> backend/src/models. This can cause initialization issues, make refactoring harder, and indicates tight coupling.

---

*Generated at 2026-10-22T03:07:07Z in 1.2145176s. 1917 facts, 111 insights.*
