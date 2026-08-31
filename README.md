# ReuseHub

A campus marketplace for giving things a second life. Members list items they no
longer need; others request them; contact details are exchanged only after a
request is accepted.

Everything the site presents — categories, conditions, the campus directory, all
copy, the colour scheme, limits and feature flags — is stored in the database and
editable from the admin panel. There are no hardcoded categories or locations.

```
Frontend   React 19 + Vite          frontend
Backend    Express 5 + Prisma 6     backend
Database   MySQL 8
Cache      Redis 7 (optional)
```

> **Working in a team?** Read **[TEAMWORK.md](./TEAMWORK.md)** first. One person
> can run the backend and share a URL so everyone else works on the frontend with
> no database at all — and it explains the git workflow that stops people's work
> overwriting each other.

---

## Getting started

Two ways to run it. **Docker** needs nothing installed but Docker itself, and is
the closest thing to production. **Local** is faster to restart while you are
editing code.

Don't run both at once — they both want port 5000.

---

### Option A — Docker (recommended)

**Step 1.** Install [Docker Desktop](https://docs.docker.com/get-started/get-docker/)
and make sure it is running.

**Step 2.** Create your environment file, from the repo root:

```powershell
copy .env.example .env
```

**Step 3.** Open `.env` and set a JWT secret. Generate one with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste the output after `JWT_SECRET=`. The stack refuses to start without it —
there is no default, because a shipped default secret is trivially forged.

While you are in there, set the admin account so you can reach the admin panel:

```env
ADMIN_EMAIL=admin@reusehub.test
ADMIN_PASSWORD=choose-something-real
ADMIN_NAME=Site Admin
ADMIN_MOBILE=9876500000
```

**Step 4.** Build and start everything:

```powershell
npm run docker:up
```

First run takes a few minutes (it downloads MySQL, Redis, Node and nginx). It is
finished when you see `api` become `healthy`. The API container waits for MySQL
and Redis, applies migrations, seeds demo data, then starts.

**Step 5.** Open **http://localhost:3000**

| | |
|---|---|
| Website | http://localhost:3000 |
| Admin panel | http://localhost:3000/admin |
| API | http://localhost:5000/api |
| Health | http://localhost:5000/api/health |

Stop it with `npm run docker:down`. To wipe the database and start clean,
`npm run docker:reset`.

Ports 3000 and 3307 are used rather than 80 and 3306 so the stack does not
collide with a local MySQL, or with Jenkins on 8080.

---

### Option B — Local (no Docker)

You need **Node 20+** and a **MySQL 8** server you can connect to.

**Step 1.** Install dependencies, once, from the repo root:

```powershell
npm install
```

This is an npm workspace, so one install covers both apps.

**Step 2.** Create the database in MySQL:

```sql
CREATE DATABASE reusehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

`utf8mb4` matters — category icons are emoji, and `utf8mb3` silently replaces
them with `??`.

**Step 3.** Configure the API:

```powershell
copy backend/.env.example backend/.env
```

Edit `backend/.env` and set two values:

```env
DATABASE_URL="mysql://root:your_mysql_password@localhost:3306/reusehub"
JWT_SECRET=paste-a-generated-secret-here
```

If your MySQL password contains `% : / ? # @`, percent-encode it — those are URL
syntax and will otherwise be misparsed.

Leave `REDIS_ENABLED=false` unless you have Redis running locally. The app works
either way; caching just becomes a pass-through.

**Step 4.** Create the schema and demo data:

```powershell
cd backend
npm run db:migrate
npm run db:seed
cd ..
```

To get an admin account, set the `ADMIN_*` values in `backend/.env` before
running the seed.

**Step 5.** Start both servers with one command, from the repo root:

```powershell
npm run dev
```

Output is colour-coded `[api]` and `[web]`. `Ctrl+C` stops both.

**Step 6.** Open **http://localhost:5173**

| | |
|---|---|
| Website | http://localhost:5173 |
| Admin panel | http://localhost:5173/admin |
| API | http://localhost:5000/api |

Vite proxies `/api` to port 5000, so the frontend uses relative URLs and needs
no CORS setup in development.

If you would rather have two terminals:

```powershell
cd backend  ; npm run dev     # terminal 1
cd frontend  ; npm run dev     # terminal 2
```

---

### Logging in

The seed creates three demo members, all with the password `password123` —
`aarav@example.com` is the one referenced in the docs.

The admin account is whatever you put in `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Blank
values skip admin creation entirely rather than shipping a known password.

The admin panel is **unlisted** — there is no link to it anywhere in the public
site. Reach it by typing `/admin` on whatever host the site runs on
(`localhost:3000/admin`, `yourdomain.com/admin`). A signed-in member who is not
staff gets a permission notice; a signed-out visitor is sent to log in. Hiding
the link is convenience, not security: every `/api/admin/*` route re-checks the
caller's rank on the server.

### First things to try in the admin panel

These demonstrate that nothing is hardcoded:

- **Categories** → add "Sports". Open *List an item* — it is already in the
  dropdown, and `/items?category=Sports` filters by it. No restart, no migration.
- **Settings → theme** → change *Accent colour*. Every button and CTA retints.
- **Settings → content** → rewrite the hero headline. The home page follows.
- **Locations** → add a city, then an area inside it, then a college. It becomes
  selectable on a new listing immediately.
- **Settings → items** → set *Maximum active listings per user* to 1. A member's
  second listing is refused with a 403.

---

## Troubleshooting

**`Port 5173 is already in use` / `FATAL: port 5000 is already in use`**

A previous server is still running — usually a terminal closed without `Ctrl+C`,
or Docker running at the same time as `npm run dev`. Stop the strays:

```powershell
Get-Process node | Stop-Process -Force
```

To see what is holding a port first:

```powershell
Get-NetTCPConnection -LocalPort 5000 -State Listen | Select-Object OwningProcess
```

**`Environment variable not found: DATABASE_URL`**

`backend/.env` is missing or has no `DATABASE_URL`. See Option B, step 3.

**`JWT_SECRET is required` when running Docker**

The repo-root `.env` has no secret. See Option A, step 3. Note Docker reads the
**root** `.env`, while local development reads `backend/.env` — they are
separate files.

**Docker and local show different data**

They are different databases. Docker uses its own volume; local uses your
installed MySQL. An account created in one does not exist in the other.

**Category icons show as `??`**

The database was created without `utf8mb4`. Recreate it with the `CREATE DATABASE`
statement in Option B, step 2.

**Admin panel says "You do not have permission"**

The signed-in account is not staff. Promote it with `npm run db:studio` (set
`users.role` to `super_admin`), or set the `ADMIN_*` variables and re-seed.

---

## Layout

```
reusehub/
├── docker-compose.yml
├── docker/nginx/default.conf     # serves the built web app, proxies /api
├── apps/
│   ├── api/
│   │   ├── prisma/               # schema.prisma, migrations, seed.js
│   │   └── src/
│   │       ├── config/env.js     # every environment variable, validated
│   │       ├── lib/              # prisma, redis, cache
│   │       ├── middleware/       # auth, validation, maintenance, rate limit
│   │       ├── models/           # all database access
│   │       ├── controllers/      # HTTP only, no SQL
│   │       ├── routes/
│   │       └── validators/
│   └── web/
│       └── src/
│           ├── app/              # router, auth + config providers
│           ├── admin/            # the admin panel
│           ├── components/ui/    # design-system primitives
│           ├── lib/              # api client, display helpers
│           ├── pages/
│           └── styles/tokens.css
└── backend/tests-legacy/        # pre-refactor suite, needs porting
```

`models/` is the only layer that touches the database and `controllers/` is the
only layer that knows about HTTP. Keeping those separate is what makes a storage
change touch one file.

---

## How "nothing is hardcoded" works

The frontend fetches `GET /api/config` once at boot. That single response carries
the public settings, the active categories and conditions, the navigation and
social links, and the full city → area → college tree. `ConfigProvider` puts it
in context and writes the theme settings straight onto `:root` as CSS custom
properties.

So adding a category in the admin panel makes it appear in the listing form, the
home page and the browse filters, and changing `color_accent` retints every
call-to-action — with no rebuild and no restart.

The rule the settings layer enforces is that **a setting no code reads is a
switch that lies**. Every key in `settingsModel.DEFAULT_SETTINGS` names the file
that honours it; if you add a key, add its reader in the same change.

### What the admin panel controls

| Section | What it changes |
|---|---|
| Dashboard | KPIs with week-on-week movement, a 14-day activity chart, category/campus mix, live feeds and service health |
| Listings | Approve, reject, hide or requeue any listing |
| Reports | Work the complaint queue |
| Users | Block, unblock and change roles |
| Categories | Add, rename, reorder, retire |
| Conditions | Add, rename, reorder, retire |
| Locations | Cities, areas and colleges |
| Navigation | Header/footer links and social profiles |
| Settings | Branding, theme colours, all copy, contact details, limits, flags, SEO |
| Audit log | Every administrative write, append-only |

Roles are ranks — `user < moderator < admin < super_admin` — and each route
names the minimum rank that may enter it. Two further checks live in the
controllers because a route guard cannot see *who the target is*: you cannot act
on your own account, and you cannot act on a peer or a superior.

---

## API

`GET /api/` lists every route. Beyond the public browse/auth/request endpoints:

```
GET    /api/config                          public bootstrap (cached)
GET    /api/categories, /api/conditions     active taxonomy
POST   /api/uploads/image                   listing photo (multipart, logged in)

GET    /api/admin/overview                  staff
GET    /api/admin/items, /reports           staff
PATCH  /api/admin/items/:id/moderation      staff
GET    /api/admin/users                     admin
PATCH  /api/admin/users/:id/role            super admin
GET    /api/admin/settings                  admin
PUT    /api/admin/settings                  admin
CRUD   /api/admin/categories, /conditions   admin
CRUD   /api/admin/locations/{cities,areas,colleges}   admin
CRUD   /api/admin/nav-links, /social-links  admin
GET    /api/admin/audit                     admin
```

Every response uses one envelope — `{ success, message?, data }` — so the
frontend has a single rule: read `success`, then read `data` or `message`.

Deleting a location answers **409 with the exact dependant counts** unless the
request repeats with `?confirm=1`. Areas and colleges cascade, and items and
users are detached with `SET NULL`, so one careless delete would strand every
listing at a campus with nothing to undo it. The database will not stop that,
which is why the application does.

---

## Listing photos

The photo field on the item form is a drop zone, not a URL box. It accepts a
file **dropped** onto it, **pasted** with Ctrl+V (a screenshot, or Copy Image
from another page), or picked with a **file browser**. Pasting a link still
works — a pasted `https://` URL is taken as-is — so photos bundled with the seed
and any external image continue to function.

Uploads go to `POST /api/uploads/image`, are written under `backend/uploads/`,
and are served back at `/uploads/<name>`. In Docker that directory is the
`api-uploads` named volume, so photos survive a rebuild.

**The file type is decided by the bytes, not by the browser.** `Content-Type`
and the filename both come from the client and can claim anything — an HTML file
renamed `photo.png` would pass a mimetype check and then be served from our own
origin, which is how an upload form becomes stored XSS. So the magic-byte
signature is read from the buffer and is the only thing that picks the
extension, the stored name is generated rather than taken from the upload, and
responses carry `nosniff` plus a restrictive CSP. SVG is deliberately not
accepted: it is XML, it can carry `<script>`, and no signature separates a safe
one from a hostile one.

Two admin settings control it, under **Settings → items**:

| Setting | Effect |
|---|---|
| `allow_image_uploads` | Off: file upload is refused, pasting a link still works |
| `max_image_mb` | Largest uploadable photo (default 5MB; 16MB hard cap) |

## Redis

Caching and rate limiting are Redis-backed but **optional**. If Redis is
unreachable the client stops trying, `cache.wrap()` becomes a pass-through, and
rate limiting is skipped — a cache outage must not take the site down. Set
`REDIS_ENABLED=false` to opt out entirely. `GET /api/health` reports the current
state.

## Database changes

Prisma is the single source of truth for the schema.

```bash
cd backend
npm run db:migrate:dev -- --name what_changed   # development
npm run db:migrate                             # production / CI
npm run db:studio                           # browse the data
```

`items.category` and `items.item_condition` are `VARCHAR`, not `ENUM`, and are
validated at write time against the active rows in `categories` / `conditions`.
That is what allows a new category to be added without a migration. They store
the label rather than a foreign key so the `category: "Books"` JSON shape the
frontend reads stays unchanged.

## Security notes

- Passwords are bcrypt-hashed and never stored, logged or returned.
- The JWT payload carries only the user id. It is base64, not encryption —
  anyone holding a token can read it, so nothing secret goes in it.
- Personal data is scoped by `req.user.id` taken from the verified token
  signature, never from a URL, body or header. This is why the dashboard is
  `GET /api/dashboard` and not `/api/dashboard/:userId` — there is no id to
  tamper with.
- Route guards in React control what a user *sees*; middleware controls what a
  user *can do*. Only the second is a security boundary.
- Login returns an identical response for an unknown email and a wrong password,
  so the API cannot be used to discover which addresses are registered.
- An item's `location` is derived server-side from the chosen college, so
  `{ collegeId: 4, location: "Kota" }` cannot store a filter and a label that
  contradict each other.
- `.env` is gitignored. `config/env.js` prints whether a secret is set, never
  its value.

## Tests

The previous 341-test suite is in `backend/tests-legacy/` and does not
currently run — it was written against the mysql2 pool and the enum-based
taxonomy, both of which are gone. `tests-legacy/README.md` describes what each
file needs in order to be ported back.
