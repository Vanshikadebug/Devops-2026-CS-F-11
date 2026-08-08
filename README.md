# ReuseHub

> A platform for listing items you no longer need, so someone else can reuse them
> instead of them becoming waste.

**Status:** 🚧 Under active development — Phase 5 of 18 complete (frontend reads live data from MySQL).

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

Demo login (available from Phase 6): `aarav@example.com` / `password123`

**Tests:**

```bash
cd backend && npm test    # 33 tests
```

## API endpoints

| Method | Path | Auth | Phase |
|---|---|---|---|
| `GET` | `/api/health` | — | 3 |
| `GET` | `/api/items` | — | 5 |
| `GET` | `/api/items/:id` | — | 5 |

## Build phases

- [x] **Phase 1** — Project setup and architecture
- [x] **Phase 2** — Frontend setup
- [x] **Phase 3** — Backend setup
- [x] **Phase 4** — MySQL database
- [x] **Phase 5** — Frontend–backend connection
- [ ] Phase 6 — Registration and authentication
- [ ] Phase 7 — Dashboard
- [ ] Phase 8 — Item management
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
