# Working as a team

Three people, three branches, one project. This covers the two things that go
wrong: **setup** (a teammate clones and nothing runs) and **git** (someone pulls
and their work disappears).

---

## Part 1 — Why a fresh clone does not run

Nothing is broken. Two files are deliberately **not** in git:

| File | Why it is not committed |
|---|---|
| `.env` (repo root) | Docker config, holds `JWT_SECRET` |
| `backend/.env` | Local config, holds the database password |
| `frontend/.env` | Points at whichever backend you use |

They are in `.gitignore` on purpose — committing secrets is how they leak, and
each person's database password is different anyway. Git only carries the
`.env.example` templates.

So a clone has no config, and the backend refuses to start:

```
[config] FATAL: required environment variable JWT_SECRET is missing.
```

That message is the app working correctly. It will not boot half-configured and
fail mysteriously later.

**There are two ways to fix it, and they are very different amounts of work.**

---

## Part 2 — The easy way: one shared backend

One person (whoever owns the data) runs the backend and database. Everyone else
runs **only the frontend** and points it at that person's machine. One database,
shared by all three — exactly like a real staging environment.

### If you are hosting (the one running the backend)

```powershell
npm run docker:up      # MySQL + Redis + API + web, all in Docker
```

Now expose port **5000** publicly. Two options:

**Option A — VS Code (nothing to install)**

1. Open the **Ports** panel (next to Terminal)
2. **Forward a Port** → type `5000`
3. Right-click the row → **Port Visibility** → **Public**
4. Copy the URL it shows, e.g. `https://a1b2c3d4-5000.devtunnels.ms`

> Visibility **must** be Public. Left Private, your teammates get a login page
> instead of the API, which looks like a broken backend.

**Option B — Cloudflare tunnel, scripted**

```powershell
npm run share
```

Runs `cloudflared` as a compose service — nothing to install — and prints the
URL plus the exact line to send.

### Check it before you send it

```powershell
curl https://YOUR-URL/api/health
```

You want `"database":"connected"`. If that fails for you it will fail for them.

Then send the team one line:

```
VITE_API_URL=https://a1b2c3d4-5000.devtunnels.ms
```

Keep your machine and the stack running — everyone is using your database. The
URL changes if you restart the tunnel, so resend it when that happens.

| | |
|---|---|
| Stop the Cloudflare tunnel | `npm run share:stop` |
| Watch it | `npm run share:logs` |
| VS Code | Remove the row from the Ports panel |

### If you are a frontend developer

```powershell
git clone <repo>
cd reusehub/frontend
npm install
copy .env.example .env
```

Put the line you were given into `frontend/.env`:

```env
VITE_API_URL=https://a1b2c3d4-5000.devtunnels.ms
```

```powershell
npm run dev            # http://localhost:5173
```

That is the whole setup. **No MySQL, no Redis, no Docker, no backend.** You are
reading and writing the shared database, so what you see is what everyone sees.

Restart `npm run dev` after editing `.env` — Vite reads it at startup, and a hot
reload will not pick up the change.

### Why this needs no CORS fiddling

`ALLOW_TUNNEL_ORIGINS` (on by default outside production) trusts
`*.devtunnels.ms`, `*.trycloudflare.com` and `*.ngrok*`. Those hostnames change
on every restart, so pinning each one in `CORS_ORIGINS` would mean editing it
several times a day. Turn it **off** in production, where origins are fixed.

Uploaded photos also work: they are stored as `/uploads/ab12.png`, and
`assetUrl()` in `frontend/src/lib/origin.js` prepends `VITE_API_URL` so they
resolve against the hosting machine instead of 404ing locally.

> A public tunnel is **unauthenticated** — anyone with the URL reaches your API
> and its data, including write endpoints. Fine for a dev database among
> teammates. Never point one at anything real, and shut it off when you finish.

---

## Part 3 — The full way: your own backend

Only needed if you are changing backend code, the schema, or want to work
offline. Follow **Option B — Local** in the [README](./README.md). You get your
own separate database, so your data will not match anyone else's. That is normal.

---

## Part 4 — Git: why work disappears, and how to stop it

**This has already happened in this repo.** In PR #9 (*"Resolve merge conflict
with latest main"*), `README.md` was resolved in favour of the older branch. The
newer version was discarded, and the file went back to describing an `apps/api/`
folder that no longer exists — which is exactly why a teammate following it could
not create `backend/.env` and could not start the backend.

Nothing was lost by git. It was lost by **how the conflict was answered**.

### The rule that prevents almost all of it

> Pull before you push. Every time.

Most "my code vanished" moments are one person committing on top of a stale copy
and then resolving the conflict by keeping their own side wholesale.

### Daily loop

```powershell
git checkout yash               # your own branch, never main
git pull origin main            # bring in everyone else's merged work FIRST
# ...work...
git add -A
git commit -m "what changed"
git push origin yash
```

Then open a pull request into `main` on GitHub.

### When git reports a conflict

A conflict means **you and someone else changed the same lines**. Git is asking
which to keep — it is not an error, and it is not telling you to pick a side.

```
<<<<<<< HEAD
your version
=======
their version
>>>>>>> main
```

Open the file and produce the version that keeps **both** people's intent, then
delete the three marker lines. Do not resolve by taking one whole file, which is
what happened to the README.

```powershell
git add <file>
git commit
```

If you are unsure, ask the person whose lines you are about to drop. Thirty
seconds of asking beats re-doing an afternoon.

### Compare before you accept

```powershell
git diff main...yash            # what your branch changes
git log --oneline main..yash    # your commits not yet in main
```

### Recovering something you already lost

Git almost never truly deletes. Every commit that ever existed is reachable:

```powershell
git reflog                      # every HEAD you have had, with hashes
git show <hash>:path/to/file    # read the old version
git checkout <hash> -- path/to/file   # bring it back
```

### Staying out of each other's way

Because `backend/` and `frontend/` are independent packages with their own
`package.json` and `node_modules`, two people working on opposite sides rarely
touch the same file at all. The files that *do* collide are the shared ones:

| File | Risk | Habit |
|---|---|---|
| `README.md`, docs | High — everyone edits | Read the diff, merge both sides |
| `package.json` | Medium — added deps | Keep both dependency lines |
| `package-lock.json` | Noisy | Take main's, re-run `npm install`, commit |
| `prisma/schema.prisma` | **Highest** | Announce it — see below |

### Schema changes need a heads-up

The shared-backend setup has one sharp edge. If someone changes
`prisma/schema.prisma` and you are all using the host's database, the host must
run the migration before the others pull:

```powershell
npm run db:migrate
```

Until they do, the running API and the database disagree, and queries fail for
everyone. So: say it in chat before you change the schema.

---

## Quick reference

| Situation | Do |
|---|---|
| Frontend only, want it working in 2 minutes | Part 2 — get a `VITE_API_URL` |
| Changing backend code or the schema | Part 3 — run your own |
| Fresh clone will not start | You have no `.env`. Part 1 |
| Teammate gets `Origin ... is not allowed` | Add their origin to `CORS_ORIGINS` |
| Teammate gets `Could not reach the server` | Tunnel is down, or the URL is wrong |
| Photos broken on a shared backend | `VITE_API_URL` missing or stale |
| About to push | `git pull origin main` first |
| Conflict markers in a file | Keep both sides, then `git add` + `git commit` |
| Lost work | `git reflog` |
