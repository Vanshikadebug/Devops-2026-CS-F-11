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

1. **Jenkins** is running (you have it on `http://localhost:8080`).
2. **Docker Desktop** is running — the pipeline starts a throwaway MySQL 8
   container for the tests.
3. **Node.js + npm** and **docker** are reachable from the account Jenkins
   runs as. Quick check: on the job's first run, the *Backend - Install*
   stage runs `npm ci`; if it errors with *"'npm' is not recognized"*, see
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
3. *(Optional)* **Build Triggers** → tick **Poll SCM** and enter `H/5 * * * *`
   to check GitHub for new commits every ~5 minutes. (Or set up a GitHub
   webhook later.)
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

**`docker: command not found` or `error during connect ... dockerDesktopLinuxEngine`.**
Jenkins cannot reach Docker. The usual cause on Windows: **Docker Desktop
runs per-user, but Jenkins runs as a service under a different account** that
cannot see Docker Desktop's pipe. Options:
- Make sure Docker Desktop is running, and run the Jenkins service as **your
  own user account** (Services → Jenkins → Log On tab), or add the Jenkins
  account to the **docker-users** group and restart.
- Or use the **local-MySQL fallback** below (no Docker needed).

**`Bind for 0.0.0.0:3307 failed: port is already allocated`.**
Something already uses 3307. Change `DB_PORT` in the `Jenkinsfile`
`environment {}` block (e.g. to `3308`) and rebuild.

**The first build is slow / seems stuck on "Start MySQL".**
It is pulling `mysql:8.0` (a few hundred MB) the first time. Subsequent
builds are fast. `wait-for-db.js` waits up to ~60s for the DB to be ready.

---

## Fallback: use the local MySQL instead of Docker

If Docker-from-Jenkins is more trouble than it is worth on your setup, point
the pipeline at your existing MySQL on 3306 and drop the container stages:

1. In the `Jenkinsfile` `environment {}` block, set:
   ```groovy
   DB_HOST = '127.0.0.1'
   DB_PORT = '3306'
   DB_NAME = 'reusehub_ci'   // a dedicated CI database, NOT your dev one
   ```
2. Delete the **`Database - Start MySQL (Docker)`** stage and the
   `docker rm -f` line in the `post { always { } }` block. Keep the
   `wait-for-db.js` call by moving it into the Schema stage (harmless — it
   returns immediately when MySQL is already up).
3. Provide the password **without hardcoding it**: add it under **Manage
   Jenkins → Credentials** as a *Secret text* with id `ci-db-password`, then
   in the `environment {}` block use:
   ```groovy
   DB_PASSWORD = credentials('ci-db-password')
   ```

This keeps your real MySQL data safe by using a separate `reusehub_ci`
database that `db:setup` rebuilds each run.

---

## A note on secrets

The `DB_PASSWORD` in the committed `Jenkinsfile` is a **disposable value for a
throwaway container** that lives only for one build and is reachable only on
localhost — it is intentionally not a real credential. Anything genuinely
secret (a production database password, a real `JWT_SECRET`) must live in
**Jenkins → Credentials** and be pulled in with `credentials('id')`, never
written into the repo. In test mode the app supplies its own throwaway
`JWT_SECRET`, so none is needed here.
