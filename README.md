# ReuseHub

> A platform for listing items you no longer need, so someone else can reuse them
> instead of them becoming waste.

**Status:** 🚧 Under active development — core phases 1–11 complete, plus Git/GitHub (Phase 12) and a Jenkins CI pipeline (Phase 14). Highlights: search and filtering by campus, the request system wired end to end, the first slices of the admin API — an overview snapshot, item moderation, report review, and account management — the user-facing route that lets members file the reports that queue works from, and a 341-test backend suite that a Jenkins pipeline now runs automatically on every push (against an isolated `reusehub_ci` database on the local MySQL, then building the frontend).

This README is a placeholder. The full documentation (architecture, database
design, installation, API reference, Docker, Jenkins, CI/CD) is written in
**Phase 17**.

---

## Quick facts

| | |
|---|---|
| Frontend | React + Vite (port `5173`) |
| Backend | Node.js + Express (port `5000`) |
| Database | MySQL 8 (port `3306`) |
| Auth | JWT + bcrypt |
| Tests | Jest + Supertest |
| CI/CD | Jenkins |

> ⚠️ The backend uses port **5000**, not 8080, because Jenkins occupies 8080
> on the development machine.

## Port map

| Service | Port | Notes |
|---|---|---|
| Frontend (Vite dev) | 5173 | |
| Backend (Express) | 5000 | |
| MySQL | 3306 | |
| Jenkins | 8080 | Pre-existing; do not reuse this port |

## Getting started (so far)

You need **two terminals**, both running at the same time.

**Terminal 1 — backend** (API + database):

```bash
cd backend
cp .env.example .env   # first time only, then fill in your MySQL password
npm install            # first time only
npm run db:reset       # first time only — creates the schema and demo data
npm run dev            # http://localhost:5000/api/health
```

**Terminal 2 — frontend**:

```bash
cd frontend
npm install     # first time only
npm run dev     # http://localhost:5173
```

Then open **http://localhost:5173** — the item grid is served from MySQL.

You can register a new account, or use a demo login:
`aarav@example.com` / `password123`

Logging in lands you on **/dashboard** — your own items, your own request
counts, nobody else's. From there, **List an item** opens the form and
**My items** manages what you have already posted. **Requests** shows what
others have asked for on your items — accept or decline each one — alongside
the requests you have sent; contact details are exchanged only after a request
is accepted.

**Tests:**

```bash
cd backend && npm test    # 341 tests
```

## API endpoints

| Method | Path | Auth | Phase |
|---|---|---|---|
| `GET` | `/api/health` | — | 3 |
| `POST` | `/api/auth/register` | — | 6 |
| `POST` | `/api/auth/login` | — | 6 |
| `GET` | `/api/auth/me` | Bearer token | 6 |
| `GET` | `/api/items` | — | 5 |
| `GET` | `/api/items/:id` | — | 5 |
| `GET` | `/api/items/mine` | Bearer token | 7 |
| `POST` | `/api/items` | Bearer token | 8 |
| `PUT` | `/api/items/:id` | Bearer token + **owner** | 8 |
| `PATCH` | `/api/items/:id/status` | Bearer token + **owner** | 8 |
| `DELETE` | `/api/items/:id` | Bearer token + **owner** | 8 |
| `GET` | `/api/dashboard` | Bearer token | 7 |
| `GET` | `/api/locations/cities` | — | 9 |
| `GET` | `/api/locations/cities/:id/areas` | — | 9 |
| `GET` | `/api/locations/colleges` | — | 9 |
| `GET` | `/api/locations/colleges/:id` | — | 9 |
| `PUT` | `/api/users/me/college` | Bearer token | 9 |
| `POST` | `/api/requests` | Bearer token | 10 |
| `GET` | `/api/requests/sent` | Bearer token | 10 |
| `GET` | `/api/requests/received` | Bearer token | 10 |
| `PATCH` | `/api/requests/:id` | Bearer token + **item owner** | 10 |
| `POST` | `/api/reports` | Bearer token | admin |
| `GET` | `/api/admin/overview` | Bearer token + **staff** | admin |
| `GET` | `/api/admin/items` | Bearer token + **staff** | admin |
| `GET` | `/api/admin/items/:id` | Bearer token + **staff** | admin |
| `PATCH` | `/api/admin/items/:id/moderation` | Bearer token + **staff** | admin |
| `GET` | `/api/admin/reports` | Bearer token + **staff** | admin |
| `GET` | `/api/admin/reports/:id` | Bearer token + **staff** | admin |
| `PATCH` | `/api/admin/reports/:id/review` | Bearer token + **staff** | admin |
| `GET` | `/api/admin/users` | Bearer token + **admin** | admin |
| `GET` | `/api/admin/users/:id` | Bearer token + **admin** | admin |
| `PATCH` | `/api/admin/users/:id/status` | Bearer token + **admin** | admin |
| `PATCH` | `/api/admin/users/:id/role` | Bearer token + **super-admin** | admin |

Protected endpoints expect the token in a header:

```
Authorization: Bearer <token>
```

**Owner** means the `checkItemOwnership` middleware runs after `protect`: a
missing item answers `404`, and someone else's item answers `403` — before the
controller runs at all.

**Item owner** on `PATCH /api/requests/:id` is the same idea enforced a step
later: only the owner of the *requested item* may accept or decline it, so the
request controller loads the row and compares its `owner_id` against
`req.user.id` before touching anything. A stranger's `PATCH` answers `403`; a
request id that does not exist answers `404`.

**Staff / admin / super-admin** on the `/api/admin` routes are ranks, not
separate flags: a single `role` column orders `user < moderator < admin <
super_admin`, and each route names the *minimum* rank that may enter it. The
overview, item moderation and report review are staff-level (a moderator may
read the aggregate counts, approve/reject/hide/requeue a listing, and work
the complaint queue); managing accounts is admin-level; changing a role — the
power that grants powers — is super-admin-only. A logged-in user below the bar
answers `403`, and no token at
all answers `401`. Two further checks live in the controller, because a
route-level "is at least an admin" guard cannot see *who the target is*: you
cannot act on your own account from the panel (`422`), and you cannot act on a
peer or a superior or grant a role above your own (`403`). Every block, unblock
and role change writes an `audit_logs` row after it commits — as does every
moderation decision and every report review, so "who hid this listing, who
closed this complaint, and why" always has an answer.

**Filing a report** is the one report route that is *not* staff-only:
`POST /api/reports` is open to any logged-in member, because the complaint
queue staff work has to be fed from somewhere. A report names exactly one
target — a listing **or** an account, never both and never neither — and you
cannot report your own listing or yourself. The reporter is always taken from
the token, never the request body, and a per-reporter uniqueness rule means the
same person cannot report the same target twice; a second attempt answers
`409`. Reading and resolving those reports stays on the staff-only
`/api/admin/reports` routes above.

## Security notes

- Passwords are hashed with **bcrypt** (per-password salt) and are never stored,
  logged, or returned by the API.
- The JWT payload carries **only the user id** — it is base64, not encryption,
  so anyone holding a token can read it.
- Route guards in React control what a user **sees**; the `protect` middleware
  on the server controls what a user **can do**. The second one is the security
  boundary — the first can be bypassed from the browser.
- Personal data is scoped by `req.user.id`, taken from the **verified token
  signature** — never from a URL, query string, body field or header. This is
  why the dashboard is `GET /api/dashboard` and not `/api/dashboard/:userId`:
  there is no id to tamper with. `tests/dashboard.test.js` sends five separate
  attempts to name another account and asserts all five return the caller's own
  data.
- Login returns an identical response for an unknown email and a wrong password,
  so the API cannot be used to discover which addresses are registered.
- **You can only edit, re-status or delete your own items**, and that is decided
  on the server. The React pages hide the controls on items you do not own, but
  hiding a button is presentation, not protection — `checkItemOwnership` compares
  the row's `user_id` against `req.user.id` from the verified token, so the same
  three requests sent by hand (curl, DevTools, a script) still answer `403`.
- An item's `location` is **derived server-side** from the chosen college, not
  taken from the request. A body may claim `{ collegeId: 4, location: "Kota" }`,
  which is individually valid and permanently self-contradictory; the server
  looks the college up and stores its real area and city instead.
- All SQL uses prepared statements.
- `.env` is gitignored and never committed.

## Build phases

- [x] **Phase 1** — Project setup and architecture
- [x] **Phase 2** — Frontend setup
- [x] **Phase 3** — Backend setup
- [x] **Phase 4** — MySQL database
- [x] **Phase 5** — Frontend–backend connection
- [x] **Phase 6** — Registration and authentication
- [x] **Phase 7** — Dashboard
- [x] **Phase 8** — Item management
- [x] **Phase 9** — Search and filtering
- [x] **Phase 10** — Request system
- [x] **Phase 11** — Testing
- [x] **Phase 12** — Git and GitHub
- [ ] Phase 13 — Docker
- [x] **Phase 14** — Jenkins — declarative pipeline in [`Jenkinsfile`](./Jenkinsfile); see [JENKINS_SETUP.md](./JENKINS_SETUP.md)
- [ ] Phase 15 — CI/CD
- [ ] Phase 16 — Deployment preparation
- [ ] Phase 17 — README and documentation
- [ ] Phase 18 — Final testing and presentation preparation
