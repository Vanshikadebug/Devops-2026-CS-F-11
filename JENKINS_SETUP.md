# Jenkins Setup — ReuseHub (Phase 14)

This guide sets up a Jenkins **Pipeline** that builds ReuseHub end to end on
every push and shows the whole thing as a row of stage boxes — **Checkout →
Backend Install → Start MySQL → Schema/Seed/Migrate → Test (321) → Frontend
Install → Frontend Build → Archive** — plus a **Test Result Trend** graph.
That "everything, side by side, going green" view is the page to show in a
review.

The pipeline is defined by the [`Jenkinsfile`](./Jenkinsfile) at the repo
root. Jenkins reads it straight from GitHub, so there is nothing to paste
into Jenkins by hand except the job configuration below.

---

## What you get

| Where in Jenkins | What it shows |
|---|---|
| **Stage View** (job page) | The 8 stages side by side, each green/red, with per-stage timing |
| **Test Result Trend** (job page) | A graph of passed/failed tests across builds — the 321 tests |
| **Test Result** (per build) | Every test by name; click a failure to see why |
| **Console Output** (per build) | The full timestamped log of the whole build |
| **Build Artifacts** (per build) | The built `frontend/dist` bundle, kept for later |

---

## Prerequisites (on the machine running Jenkins)

1. **Jenkins** is running (you have it on `http://localhost:8080`). Leave it on
   the default **Local System** service account — you do **not** need to switch
   it to your own user (see the Docker note below for why that route is a dead
   end on this machine).
2. **Docker Desktop** is running **and** its daemon is exposed over TCP:
   **Settings → General → tick "Expose daemon on tcp://localhost:2375 without
   TLS" → Apply & restart.** The pipeline talks to Docker over that port, so
   this one toggle is the single manual step it depends on. (Why TCP and not the
   normal pipe: see [Troubleshooting](#troubleshooting).)
3. **Node.js + npm** are reachable from the account Jenkins runs as. Docker does
   **not** need to be on PATH — the pipeline calls `docker.exe` by its full
   path. Quick check: on the job's first run the *Backend - Install* stage runs
   `npm ci`; if it errors with *"'npm' is not recognized"*, see
   [Troubleshooting](#troubleshooting).
4. **Plugins** (all in Jenkins' default "recommended" set): Pipeline, Git,
   JUnit, Timestamper. The NodeJS plugin is optional (only if npm is not on
   PATH).

> The pipeline uses a **throwaway** MySQL container on host port **3307**, so
> it never touches your real MySQL on 3306 or its data.

---

## One-time: push the repo first

Jenkins builds from your GitHub repository, so make sure the Jenkins phase is
pushed before you create the job:

```powershell
cd C:\ReUseHub
git add Jenkinsfile JENKINS_SETUP.md .gitignore backend/package.json backend/package-lock.json backend/scripts/wait-for-db.js README.md
git commit -m "Add Jenkins CI pipeline: Dockerised MySQL, 321-test run with JUnit reporting, frontend build"
git push
```

(See the handover note for the exact file list and commit order — **commit
part 9 first**, then this Jenkins commit.)

---

## Create the Pipeline job

1. Jenkins → **New Item**.
2. Name it `reusehub` (or `reusehub-ci`), choose **Pipeline**, click **OK**.
3. **Build Triggers** — you can leave this alone. The `Jenkinsfile` already
   declares `triggers { pollSCM('H/2 * * * *') }`, so once the job has run once,
   Jenkins polls GitHub about every 2 minutes and builds automatically on a new
   push. (If you want polling active *before* that first run, tick **Poll SCM**
   here and enter `H/2 * * * *` — same effect.) See
   [Automatic builds on every push](#automatic-builds-on-every-push) below.
4. **Pipeline** section:
   - **Definition:** `Pipeline script from SCM`
   - **SCM:** `Git`
   - **Repository URL:** `https://github.com/Vanshikadebug/reusehub.git`
   - **Branch Specifier:** `*/main` (or `*/master` — whichever your default
     branch is)
   - **Script Path:** `Jenkinsfile`  *(this is the default; leave as-is)*
5. **Save**, then click **Build Now**.

The first build is the slowest because Docker pulls the `mysql:8.0` image
once; later builds reuse it.

---

## Automatic builds on every push

Once the job exists you do **not** keep clicking **Build Now**. The
`Jenkinsfile` declares:

```groovy
triggers {
  pollSCM('H/2 * * * *')
}
```

which tells Jenkins to check GitHub about every 2 minutes and start a build
whenever a new commit has landed. (The `H` just spreads the poll across the
window so many jobs don't all hit GitHub on the same tick.)

**The chain is: save → commit → push → poll → build.**

```
edit in VS Code  →  git commit  →  git push  →  Jenkins polls GitHub  →  build
```

The trigger watches **GitHub**, not your local folder — so a change you have
only saved (or even committed) but **not pushed** is invisible to Jenkins.
"Changes show up in Jenkins" means *changes you have pushed*.

**One catch the first time:** a trigger declared inside the `Jenkinsfile`
only starts working *after* Jenkins has run one build and read it. So to turn
it on:

1. Push the commit that contains the `triggers { pollSCM(...) }` block.
2. Click **Build Now** once — this is the build where Jenkins first *reads*
   the trigger.
3. From then on every `git push` builds on its own within ~2 minutes, no
   clicking.

To confirm polling is live, open the job and look for **Git Polling Log** in
the left menu (it appears after that first build); it logs each poll and
whether it found a change. It is set to `H/2 * * * *` (~2 min) for a snappy
demo; raise it to `H/5 * * * *` to poll less often day to day.

**Why polling and not an instant webhook?** A GitHub webhook would build the
moment you push, but GitHub has to reach Jenkins over the internet to deliver
it. This Jenkins lives on `http://localhost:8080`, which has no public
address, so a webhook can't get in without a tunnel. Polling has Jenkins
reach *out* to GitHub instead, which works fine from localhost — so it is the
right fit here.

---

## What each stage does (for the walkthrough)

| # | Stage | What it proves |
|---|---|---|
| 1 | Checkout | Jenkins pulled the exact commit from GitHub |
| 2 | Backend - Install | Backend dependencies install cleanly (`npm ci`) |
| 3 | Database - Start MySQL (Docker) | A fresh MySQL 8 container starts and accepts connections |
| 4 | Database - Schema + Seed + Migrate | The database builds from `schema.sql`, seeds demo data, applies migrations |
| 5 | Backend - Test (321) | The full Jest + Supertest suite passes; results published as JUnit |
| 6 | Frontend - Install | Frontend dependencies install cleanly |
| 7 | Frontend - Build | The production Vite bundle builds without errors |
| 8 | Archive | The built site is saved as a build artifact |

After the stages, the pipeline **always** removes the MySQL container and
publishes the test report — even if a stage failed — so nothing is left
running and you can always see which test broke.

---

## Verify locally before you push (optional but recommended)

You can produce the exact JUnit report Jenkins consumes, on your own machine:

```powershell
cd C:\ReUseHub\backend
npm install          # refreshes package-lock.json with jest-junit (first time only)
npm run test:ci      # runs the 321 tests AND writes reports\junit.xml
```

If `backend\reports\junit.xml` appears and the suite is green, the pipeline's
test stage will behave the same way. (`reports/` is gitignored, so it is not
committed.)

---

## Troubleshooting

**`'npm' is not recognized` / `'node' is not recognized` in a stage.**
Node is not on the PATH of the account Jenkins runs as. Two fixes:
- *Simplest:* add Node's install folder to that account's PATH and restart
  the Jenkins service.
- *Cleaner:* install the **NodeJS** plugin, go to **Manage Jenkins → Tools →
  NodeJS installations**, add one named exactly **`node20`**, then uncomment
  the `tools { nodejs 'node20' }` block near the top of the `Jenkinsfile`.

**`'docker' is not recognized`, or `error during connect ... dockerDesktopLinuxEngine`.**
Jenkins runs as the **Local System** service account, which has two Docker
blind spots on Windows. The `Jenkinsfile` is already written to cover both, so
this is really about checking the two things it relies on:

- **`'docker' is not recognized`** → the full path in the `Jenkinsfile`'s
  `DOCKER = '...docker.exe'` line does not match this machine. Find the real one
  in PowerShell with `where.exe docker` and update that one line. (Local System
  has no `docker` on its PATH, which is exactly why we call it by full path.)
- **`error during connect ... dockerDesktopLinuxEngine`** → Docker's TCP
  endpoint isn't reachable. Confirm **Docker Desktop is running** and that
  **"Expose daemon on tcp://localhost:2375 without TLS"** is ticked (Settings →
  General). Local System can't see Docker Desktop's per-user named pipe, so the
  pipeline connects over TCP via `DOCKER_HOST = 'tcp://127.0.0.1:2375'` instead.

Note we deliberately do **not** fix this by running Jenkins as your own user.
This machine signs in with a Windows Hello **PIN**, and a PIN is not a usable
service logon password — pointing the Jenkins service at your account with it
just gives a *"logon failure"* and Jenkins won't start. Full path + TCP keeps
Jenkins on Local System and sidesteps that entirely.

**`Bind for 0.0.0.0:3307 failed: port is already allocated`.**
Something already uses 3307. Change `DB_PORT` in the `Jenkinsfile`
`environment {}` block (e.g. to `3308`) and rebuild.

**The first build is slow / seems stuck on "Start MySQL".**
It is pulling `mysql:8.0` (a few hundred MB) the first time. Subsequent
builds are fast. `wait-for-db.js` waits up to ~60s for the DB to be ready.

---

## Fallback: use the local MySQL instead of Docker

If Docker-from-Jenkins is genuinely more trouble than it is worth on your
setup, you can point the pipeline at your existing MySQL on 3306 — but read
this caveat first, because it is the reason Docker is the recommended path:

> ⚠️ **`db:setup` ignores `DB_NAME` for the database it *builds*.**
> `database/schema.sql` hardcodes `CREATE DATABASE IF NOT EXISTS reusehub` and
> `USE reusehub;`, so `npm run db:setup` always rebuilds a database literally
> named **`reusehub`** — which on your dev machine is your real dev database.
> Running CI against local MySQL therefore **clobbers your dev data** every
> build. The throwaway Docker container exists precisely to avoid this: it gets
> its own empty `reusehub` in an isolated container that is destroyed after the
> run. If you still want the local route, treat it as disposable (a machine
> whose `reusehub` DB you don't mind rebuilding), or first edit `schema.sql`
> and `setup-db.js` to honour a separate CI database name.

With that understood:

1. In the `Jenkinsfile` `environment {}` block, set:
   ```groovy
   DB_HOST = '127.0.0.1'
   DB_PORT = '3306'   // your real MySQL; note the clobber warning above
   ```
2. Delete the **`Database - Start MySQL (Docker)`** stage and the
   `"%DOCKER%" rm -f` line in the `post { always { } }` block (you can also drop
   the `DOCKER` / `DOCKER_HOST` env vars). Keep the `wait-for-db.js` call by
   moving it into the Schema stage (harmless — it returns immediately when
   MySQL is already up).
3. Provide the password **without hardcoding it**: add it under **Manage
   Jenkins → Credentials** as a *Secret text* with id `ci-db-password`, then
   in the `environment {}` block use:
   ```groovy
   DB_PASSWORD = credentials('ci-db-password')
   ```

---

## A note on secrets

The `DB_PASSWORD` in the committed `Jenkinsfile` is a **disposable value for a
throwaway container** that lives only for one build and is reachable only on
localhost — it is intentionally not a real credential. The `Jenkinsfile` sets a
disposable **`JWT_SECRET`** for the same reason: the DB-prep scripts
(`wait-for-db`, `db:setup`/`db:seed`/`db:migrate`) load `config/env.js`, which
**requires `JWT_SECRET` whenever `NODE_ENV` is not `test`** — and those scripts
run in development mode, not test mode. Both values are throwaway CI-only
secrets. Anything genuinely secret (a production database password, a real
`JWT_SECRET`) must live in **Jenkins → Credentials** and be pulled in with
`credentials('id')`, never written into the repo. The test suite itself runs as
`NODE_ENV=test` and uses a built-in dummy, so it needs neither value.
