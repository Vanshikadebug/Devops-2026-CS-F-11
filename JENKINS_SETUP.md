# Jenkins Setup — ReuseHub (Phase 14)

This guide sets up a Jenkins **Pipeline** that builds ReuseHub end to end on
every push and shows the whole thing as a row of stage boxes — **Checkout →
Backend Install → Wait for MySQL → Schema/Seed/Migrate → Test (341) → Frontend
Install → Frontend Build → Archive** — plus a **Test Result Trend** graph.
That "everything, side by side, going green" view is the page to show in a
review.

The pipeline is defined by the [`Jenkinsfile`](./Jenkinsfile) at the repo
root. Jenkins reads it straight from GitHub, so there is nothing to paste
into Jenkins by hand except the job configuration below.

> **No Docker required.** CI runs against the **local MySQL** already on this
> machine — the always-on `MySQL80` Windows service — so a build has nothing to
> start or open and a push just goes green. Docker (the app's own image) is a
> separate, later phase and is intentionally **not** part of CI: that coupling
> is what used to turn a push red whenever Docker Desktop happened to be closed.

---

## What you get

| Where in Jenkins | What it shows |
|---|---|
| **Stage View** (job page) | The 8 stages side by side, each green/red, with per-stage timing |
| **Test Result Trend** (job page) | A graph of passed/failed tests across builds — the 341 tests |
| **Test Result** (per build) | Every test by name; click a failure to see why |
| **Console Output** (per build) | The full timestamped log of the whole build |
| **Build Artifacts** (per build) | The built `frontend/dist` bundle, kept for later |

---

## Prerequisites (on the machine running Jenkins)

1. **Jenkins** is running (you have it on `http://localhost:8080`). Leave it on
   the default **Local System** service account — nothing here needs it to run
   as your own user.
2. **MySQL is running.** The `MySQL80` Windows service starts with Windows by
   default; confirm it in `services.msc` if a build ever can't reach the
   database. CI talks to it on the normal port **3306**.
3. **The one-time CI database exists** — see
   [One-time: create the CI database](#one-time-create-the-ci-database) below.
   Run it once and you never touch it again.
4. **Node.js + npm** are reachable from the account Jenkins runs as. Quick
   check: on the job's first run the *Backend - Install* stage runs `npm ci`;
   if it errors with *"'npm' is not recognized"*, see
   [Troubleshooting](#troubleshooting).
5. **Plugins** (all in Jenkins' default "recommended" set): Pipeline, Git,
   JUnit, Timestamper. The NodeJS plugin is optional (only if npm is not on
   PATH).

> CI builds into a **separate `reusehub_ci` database** and logs in as a
> **dedicated account that can reach nothing else**, so it never touches your
> real `reusehub` data on the same MySQL.

---

## One-time: create the CI database

CI logs in as a dedicated MySQL account scoped to a throwaway `reusehub_ci`
database. Create both by running [`database/ci-setup.sql`](./database/ci-setup.sql)
**once, as root**. It is safe to re-run (every statement is `IF NOT EXISTS` /
`GRANT`).

```powershell
cd C:\ReUseHub
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < database\ci-setup.sql
```

You will be prompted for your MySQL **root** password (it is not stored). Or
open the file in **MySQL Workbench** and run it with the ⚡ button.

Why this exists, in one line: it lets the committed `Jenkinsfile` carry a
**working, non-secret** login (`reusehub_ci` / `reusehub_ci_pw`) that can only
ever touch disposable CI data — so your real root password never goes near the
repo. The full reasoning is in the header of `database/ci-setup.sql`.

---

## One-time: push the repo first

Jenkins builds from your GitHub repository, so make sure this phase is pushed
before you create the job:

```powershell
cd C:\ReUseHub
git add Jenkinsfile JENKINS_SETUP.md database/ci-setup.sql backend/scripts/setup-db.js README.md
git commit -m "CI: run against local MySQL in an isolated reusehub_ci database (drop Docker from the pipeline)"
git push
```

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

There is no slow first build anymore — nothing pulls a MySQL image; the local
service is already there.

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
| 3 | Database - Wait for MySQL | The local MySQL service answers and the CI credentials work |
| 4 | Database - Schema + Seed + Migrate | The database builds from `schema.sql` into `reusehub_ci`, seeds demo data, applies migrations |
| 5 | Backend - Test (341) | The full Jest + Supertest suite passes; results published as JUnit |
| 6 | Frontend - Install | Frontend dependencies install cleanly |
| 7 | Frontend - Build | The production Vite bundle builds without errors |
| 8 | Archive | The built site is saved as a build artifact |

There is no container to tear down at the end. `reusehub_ci` is left in place;
the next build's *Schema* stage rebuilds it from scratch, so every run starts
clean anyway.

---

## Verify locally before you push (optional but recommended)

You can produce the exact JUnit report Jenkins consumes, on your own machine:

```powershell
cd C:\ReUseHub\backend
npm install          # refreshes package-lock.json with jest-junit (first time only)
npm run test:ci      # runs the 341 tests AND writes reports\junit.xml
```

If `backend\reports\junit.xml` appears and the suite is green, the pipeline's
test stage will behave the same way. (`reports/` is gitignored, so it is not
committed.)

> Note: run this way, the tests use your **local dev** database and settings
> from `backend/.env` (that is what a developer's machine is set up for).
> Jenkins is the one that points `DB_NAME` at `reusehub_ci` via the
> `Jenkinsfile`, so the isolated CI database is used **on the CI run**, not
> when you run the suite by hand.

---

## Troubleshooting

**`'npm' is not recognized` / `'node' is not recognized` in a stage.**
Node is not on the PATH of the account Jenkins runs as. Two fixes:
- *Simplest:* add Node's install folder to that account's PATH and restart
  the Jenkins service.
- *Cleaner:* install the **NodeJS** plugin, go to **Manage Jenkins → Tools →
  NodeJS installations**, add one named exactly **`node20`**, then uncomment
  the `tools { nodejs 'node20' }` block near the top of the `Jenkinsfile`.

**The build fails at *Database - Wait for MySQL* with `ECONNREFUSED`.**
Nothing is listening on `127.0.0.1:3306`. The `MySQL80` service is not running
— start it in `services.msc` (and set it to *Automatic* so it comes up with
Windows). This is environmental, not a code problem: the Test stage never ran,
so the red build says nothing about the app.

**The build fails with `ER_ACCESS_DENIED_ERROR` / "Access denied for user
'reusehub_ci'".**
The dedicated CI account is missing or has a different password. Re-run the
one-time setup: `database\ci-setup.sql` as root (see
[One-time: create the CI database](#one-time-create-the-ci-database)). The
account name and password there must match `DB_USER` / `DB_PASSWORD` in the
`Jenkinsfile`.

**The build fails with `ER_DBACCESS_DENIED_ERROR` on `reusehub_ci`.**
The account exists but wasn't granted rights on `reusehub_ci`. Re-running
`database\ci-setup.sql` fixes it — the `GRANT ALL PRIVILEGES ON reusehub_ci.*`
lines are what the build needs.

**A test unexpectedly touched my dev data.**
It shouldn't be possible from CI: the `reusehub_ci` account has no rights on
`reusehub`. If you saw this, check that the `Jenkinsfile` still sets
`DB_NAME = 'reusehub_ci'` and that you didn't run `npm run db:reset` by hand
against your dev database.

---

## Where Docker went

Earlier versions of this pipeline started a throwaway `mysql:8.0` **Docker**
container per build. It worked, but it coupled CI to Docker Desktop being open:
if the daemon was closed (or its TCP toggle got reset by an update), a push
auto-triggered a build that went red at the *Start MySQL* stage — a failure
that had nothing to do with the code. Running against the always-on local MySQL
service removes that moving part entirely.

Docker is not gone from the project — packaging the app itself (a `Dockerfile`
per service plus a `docker-compose.yml`) is **Phase 13**, tracked separately in
the README. It just isn't a dependency of the test pipeline anymore.

---

## A note on secrets

`DB_USER` / `DB_PASSWORD` in the committed `Jenkinsfile` are a **dedicated,
non-secret CI login** (`reusehub_ci` / `reusehub_ci_pw`) created by
`database/ci-setup.sql`. That account is scoped to the `reusehub_ci` database
and can reach no real data, which is exactly why the values can live in the
repo — they are not a real credential. The `Jenkinsfile` sets a disposable
**`JWT_SECRET`** for a related reason: the DB-prep scripts (`wait-for-db`,
`db:setup`/`db:seed`/`db:migrate`) load `config/env.js`, which **requires
`JWT_SECRET` whenever `NODE_ENV` is not `test`** — and those scripts run in
development mode, not test mode. Anything genuinely secret (a production
database password, a real `JWT_SECRET`) must live in **Jenkins → Credentials**
and be pulled in with `credentials('id')`, never written into the repo. The
test suite itself runs as `NODE_ENV=test` and uses a built-in dummy, so it
needs neither value.
