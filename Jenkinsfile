// =============================================================================
//  ReuseHub -- Jenkins Pipeline (Phase 14)
// =============================================================================
//
//  WHAT THIS FILE IS
//  A "declarative pipeline". Jenkins reads it straight from the repository
//  and turns each `stage { }` below into a labelled box in the Stage View --
//  the row of boxes shown side by side on the job page, one per stage, each
//  going green as it passes. That row, plus the Test Result Trend graph the
//  `junit` step produces, is exactly the "everything, side by side" view a
//  reviewer can look at to see the whole build at a glance.
//
//  WHAT ONE BUILD DOES, IN ORDER
//    1. Checkout ................. pull this commit from GitHub
//    2. Backend  - Install ....... install backend dependencies
//    3. Database - Wait for MySQL  confirm the local MySQL service answers
//    4. Database - Schema/Seed/Migrate . build the CI database
//    5. Backend  - Test (341) .... run the Jest + Supertest suite -> JUnit XML
//    6. Frontend - Install ....... install frontend dependencies
//    7. Frontend - Build ......... produce the production Vite bundle
//    8. Archive .................. keep the built frontend as an artifact
//
//  WHERE THE TEST DATABASE COMES FROM  (this used to be a Docker container)
//  The tests need a live MySQL. This pipeline uses the LOCAL MySQL already
//  installed on this machine -- the always-on "MySQL80" Windows service -- so
//  there is NOTHING to start, open, or keep running for a build to go green.
//  A push builds on its own, with no Docker Desktop in the loop. (The app's
//  own Docker image is a separate, later phase and is deliberately NOT wired
//  into CI -- that coupling is exactly what used to make a push go red when
//  Docker Desktop happened to be closed.)
//
//  The one thing that must be true of a shared MySQL is that CI must not touch
//  the developer's real data. It doesn't: every build works inside a SEPARATE
//  database called `reusehub_ci`, reached through a DEDICATED MySQL account
//  (`reusehub_ci`) that has rights on nothing else. `db:setup` drops and
//  rebuilds only reusehub_ci, so each run starts clean and the dev `reusehub`
//  database is never opened. DB_NAME below is what steers the build into
//  reusehub_ci; setup-db.js honours it (see the note there).
//
//  ONE-TIME SETUP (run once, then never again -- see JENKINS_SETUP.md)
//  Create that database and account by running database/ci-setup.sql as root.
//  After that this pipeline is entirely self-contained.
//
//  SECRETS
//  DB_USER / DB_PASSWORD below are a DEDICATED, NON-SECRET CI login scoped to
//  the reusehub_ci database only (created by database/ci-setup.sql). They are
//  deliberately not real credentials and can reach no real data, which is why
//  they can live in the repo. JWT_SECRET is disposable in the same spirit: the
//  Jest suite runs as NODE_ENV=test and needs neither, but the DB-prep scripts
//  run in "development" mode and config/env.js requires JWT_SECRET there, so we
//  supply a throwaway one. Real secrets (a production DB password or JWT
//  secret) must come from Jenkins > Manage Credentials via credentials('id') --
//  see JENKINS_SETUP.md. config/env.js only ever logs whether a secret is
//  "[set]", never its value.
//
//  ASSUMPTIONS ABOUT THE AGENT (all covered in JENKINS_SETUP.md)
//    - This is a WINDOWS agent, so every shell step uses `bat` (not `sh`).
//    - `node` / `npm` are on the PATH of the account Jenkins runs as. If npm
//      is missing, install the NodeJS plugin and uncomment the `tools` block.
//    - The MySQL80 service is running (it starts with Windows by default) and
//      database/ci-setup.sql has been run once. No Docker is required.
// =============================================================================

pipeline {

  // `agent any` = run on any available executor (here, the built-in node on
  // the developer's Windows machine, the same box that hosts Jenkins :8080).
  agent any

  // If npm is NOT on the Jenkins account's PATH, install the "NodeJS" plugin,
  // add a Node install under Manage Jenkins > Tools named exactly "node20",
  // then uncomment these two lines. Jenkins will put that Node on PATH for
  // every `bat 'npm ...'` step below.
  // tools {
  //   nodejs 'node20'
  // }

  options {
    // Prefix every log line with a timestamp (Timestamper plugin).
    timestamps()
    // A hung npm install or DB wait must not block an executor forever.
    timeout(time: 30, unit: 'MINUTES')
    // Two builds at once would both drop and rebuild the shared reusehub_ci
    // database and race each other's tests. Serialise them.
    disableConcurrentBuilds()
    // Keep the last 20 builds -- enough history for a meaningful trend graph
    // without letting artifacts and logs grow without bound.
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  // ---------------------------------------------------------------------------
  //  AUTO-BUILD ON EVERY PUSH -- no more clicking "Build Now"
  // ---------------------------------------------------------------------------
  //  pollSCM asks Jenkins to check GitHub on a schedule and start a build
  //  whenever the commit it last built has changed. 'H/2 * * * *' is a cron
  //  expression meaning "about every 2 minutes" -- the H "hashes" the exact
  //  minute so lots of jobs don't all poll on the same tick. It is set snappy
  //  for a live demo; raise it to 'H/5 * * * *' (~every 5 min) to poll less
  //  often afterwards. Build Now still works for an instant run.
  //
  //  IMPORTANT -- the trigger watches GITHUB, not your local folder. The chain is
  //      save in VS Code  ->  git commit  ->  git push  ->  Jenkins polls  ->  build
  //  A file you have only saved (or even committed) but NOT pushed is invisible
  //  to Jenkins. "Changes show up in Jenkins" means "changes you have pushed".
  //
  //  A trigger written here only starts working AFTER one build has run and let
  //  Jenkins read it -- so push this, click Build Now once, and every push after
  //  that builds on its own. (A localhost Jenkins can't receive GitHub webhooks
  //  without a public URL, so polling is the right fit here -- see JENKINS_SETUP.md.)
  triggers {
    pollSCM('H/2 * * * *')
  }

  environment {
    // ---- Local MySQL connection the backend reads via config/env.js -------
    // 127.0.0.1, NOT "localhost": on Windows "localhost" can resolve to the
    // IPv6 address ::1, and a MySQL listening only on IPv4 then refuses the
    // connection. Pinning IPv4 avoids that trap. Port 3306 is the normal port
    // of the always-on MySQL80 service -- no container, nothing to launch.
    DB_HOST     = '127.0.0.1'
    DB_PORT     = '3306'

    // ---- The dedicated, NON-SECRET CI login (see header + ci-setup.sql) ----
    // This account exists ONLY to run CI and can touch ONLY reusehub_ci. It is
    // created once by database/ci-setup.sql. Because it can reach no real
    // data, committing these values is safe -- they are not a real credential.
    DB_USER     = 'reusehub_ci'
    DB_PASSWORD = 'reusehub_ci_pw'

    // ---- The ISOLATED CI database -- the one line that protects dev data ---
    // setup-db.js reads DB_NAME and rewrites schema.sql's CREATE DATABASE /
    // USE onto it, so the entire build lands in reusehub_ci and never in the
    // developer's `reusehub`. config/env.js defaults this to 'reusehub', so a
    // dev machine (DB_NAME unset) is unaffected; here we deliberately point
    // CI at a throwaway database instead.
    DB_NAME     = 'reusehub_ci'

    // ---- App secret the DB-prep scripts require (see SECRETS header) -------
    // config/env.js demands JWT_SECRET whenever NODE_ENV is not "test". The
    // Jest suite (test:ci) runs as NODE_ENV=test and uses a built-in dummy,
    // but wait-for-db / db:setup / db:seed / db:migrate run in the default
    // "development" mode -- without this they abort at startup with
    // "[config] FATAL: required environment variable JWT_SECRET is missing".
    // Disposable CI value, never a real secret; config/env.js logs only "[set]".
    JWT_SECRET  = 'ci_only_ephemeral_jwt_secret'
  }

  stages {

    stage('Checkout') {
      steps {
        // Pull the exact commit that triggered this build. With the job set
        // up as "Pipeline script from SCM" (see JENKINS_SETUP.md) this is the
        // same repo Jenkins read this Jenkinsfile from.
        checkout scm
      }
    }

    stage('Backend - Install') {
      steps {
        dir('backend') {
          // `npm ci` is the reproducible, lockfile-exact install CI should
          // use. The `|| npm install` fallback self-heals the one case that
          // would otherwise fail the build: a package-lock.json that has not
          // yet been regenerated after a dependency was added (e.g. the
          // first build after jest-junit was introduced).
          bat 'npm ci || npm install'
        }
      }
    }

    stage('Database - Wait for MySQL') {
      steps {
        // No container to launch anymore -- the local MySQL80 service is
        // already running. wait-for-db stays as a fast, honest readiness AND
        // credentials check: it connects with the CI account above and, if
        // the service is down or database/ci-setup.sql was never run, fails
        // HERE with a clear message instead of deep inside db:setup. When
        // MySQL is up (the normal case) it returns almost immediately.
        dir('backend') {
          bat 'node scripts/wait-for-db.js'
        }
      }
    }

    stage('Database - Schema + Seed + Migrate') {
      steps {
        dir('backend') {
          // Same three steps a developer runs locally, in the same order:
          //   setup   -> build the schema from database/schema.sql, but into
          //              reusehub_ci (DB_NAME), never the dev `reusehub`
          //   seed    -> insert the demo rows the suite logs in as
          //              (e.g. aarav@example.com, used by several tests)
          //   migrate -> apply the additive, idempotent later-phase changes
          // These scripts use the mysql2 driver and read DB_* from the
          // environment above, so they act on reusehub_ci only.
          bat 'npm run db:setup'
          bat 'npm run db:seed'
          bat 'npm run db:migrate'
        }
      }
    }

    stage('Backend - Test (341)') {
      steps {
        dir('backend') {
          // test:ci runs Jest with --ci and the jest-junit reporter, writing
          // backend/reports/junit.xml alongside the usual console output.
          bat 'npm run test:ci'
        }
      }
      post {
        always {
          // Publish the JUnit report even if some tests failed -- that is
          // precisely when you most want to see WHICH ones. This draws the
          // Test Result Trend graph and the clickable per-test breakdown.
          // Path is relative to the workspace root, hence the backend/ prefix.
          junit 'backend/reports/junit.xml'
        }
      }
    }

    stage('Frontend - Install') {
      steps {
        dir('frontend') {
          bat 'npm ci || npm install'
        }
      }
    }

    stage('Frontend - Build') {
      steps {
        dir('frontend') {
          // Vite production build -> frontend/dist. If the build breaks
          // (a bad import, a type error) this stage goes red.
          bat 'npm run build'
        }
      }
    }

    stage('Archive') {
      steps {
        // Keep the built site as a downloadable build artifact, so any build
        // in the history can be inspected or deployed later (Phase 16).
        archiveArtifacts artifacts: 'frontend/dist/**', fingerprint: true, allowEmptyArchive: false
      }
    }
  }

  post {
    always {
      // Nothing to tear down: CI uses the local MySQL service, not a
      // container, and reusehub_ci is left in place (db:setup rebuilds it
      // from scratch at the start of the next run). Results are published by
      // the Test stage's own post block above.
      echo 'Build finished -- see the Stage View and Test Result Trend above.'
    }
    success {
      echo 'BUILD GREEN: 341 tests passed and the frontend built.'
    }
    failure {
      echo 'BUILD RED: open the failed stage and the Test Result trend to see what broke.'
    }
  }
}
