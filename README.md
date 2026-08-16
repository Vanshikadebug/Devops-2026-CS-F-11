# ReuseHub

> A platform for listing items you no longer need, so someone else can reuse them
> instead of them becoming waste.

**Status:** 🚧 Under active development — Phase 8 of 18 complete (item management: listing, editing, deleting your own items).

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
| CI/CD | Jenkins + Docker + Docker Compose |

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
**My items** manages what you have already posted.

**Tests:**

```bash
cd backend && npm test    # 183 tests
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

Protected endpoints expect the token in a header:

```
Authorization: Bearer <token>
```

**Owner** means the `checkItemOwnership` middleware runs after `protect`: a
missing item answers `404`, and someone else's item answers `403` — before the
controller runs at all.

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
- [ ] Phase 9 — Search and filtering
- [ ] Phase 10 — Request system
- [ ] Phase 11 — Testing
- [ ] Phase 12 — Git and GitHub
- [ ] Phase 13 — Docker
- [ ] Phase 14 — Jenkins
- [ ] Phase 15 — CI/CD
- [ ] Phase 16 — Deployment preparation
- [ ] Phase 17 — README and documentation
- [ ] Phase 18 — Final testing and presentation preparation
