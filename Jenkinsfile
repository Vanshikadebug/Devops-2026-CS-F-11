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
//    1. Checkout ................ pull this commit from GitHub
//    2. Backend  - Install ...... install backend dependencies
//    3. Database - Start MySQL .. launch a THROWAWAY MySQL 8 in Docker
//    4. Database - Schema/Seed/Migrate . build the test database
//    5. Backend  - Test (321) ... run the Jest + Supertest suite -> JUnit XML
//    6. Frontend - Install ...... install frontend dependencies
//    7. Frontend - Build ........ produce the production Vite bundle
//    8. Archive ................. keep the built frontend as an artifact
//  Then, always: tear the database container down and publish the results.
//
//  WHY A THROWAWAY DOCKER DATABASE INSTEAD OF THE REAL LOCAL MYSQL
//  The tests need a live MySQL. Pointing them at the developer's real MySQL
//  on :3306 would (a) depend on that machine's current data and (b) risk
//  mutating it. Instead each build spins up a brand-new mysql:8 container on
//  host port 3307, builds the schema into it, runs the tests, and destroys
//  it. The build is therefore reproducible and side-effect-free -- the CI
//  ideal -- and it never touches port 3306 or the developer's data.
//
//  SECRETS
//  DB_PASSWORD below is a DISPOSABLE value for a container that exists only
//  for the lifetime of one build and is never exposed to the network beyond
//  localhost. It is deliberately NOT a real credential. Real secrets (a
//  production DB password, a JWT secret) must come from Jenkins > Manage
//  Credentials and be referenced with credentials('id') -- see JENKINS_SETUP.md.
//  In test mode the app does not even need JWT_SECRET (config/env.js supplies
//  a test-only fallback), so nothing sensitive appears in this file.
//
//  ASSUMPTIONS ABOUT THE AGENT (all covered in JENKINS_SETUP.md)
//    - This is a WINDOWS agent, so every shell step uses `bat` (not `sh`).
//    - `node` / `npm` are on the PATH of the account Jenkins runs as. If npm
//      is missing, install the NodeJS plugin and uncomment the `tools` block.
//    - Docker does NOT need to be on PATH, and Jenkins does NOT need to run as
//      a named user: we call docker by full path (DOCKER) and reach the engine
//      over TCP (DOCKER_HOST). The one manual step is ticking "Expose daemon
//      on tcp://localhost:2375 without TLS" in Docker Desktop -- see the
//      environment block below and JENKINS_SETUP.md.
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
    // A hung docker pull or DB wait must not block an executor forever.
    timeout(time: 30, unit: 'MINUTES')
    // Two builds at once would collide on the container name and port 3307.
    disableConcurrentBuilds()
    // Keep the last 20 builds -- enough history for a meaningful trend graph
    // without letting artifacts and logs grow without bound.
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    // ---- The throwaway CI database (see the header note on secrets) -------
    CI_DB_CONTAINER = 'reusehub-ci-db'
    CI_DB_IMAGE     = 'mysql:8.0'

    // ---- Connection settings the backend reads via config/env.js ----------
    // 127.0.0.1, NOT "localhost": on Windows "localhost" can resolve to the
    // IPv6 address ::1, but the container publishes on IPv4 0.0.0.0:3307, so
    // an IPv6 connection is refused. Pinning IPv4 avoids that trap.
    DB_HOST     = '127.0.0.1'
    // 3307 on the host -> 3306 in the container. Keeps CI off the real MySQL.
    DB_PORT     = '3307'
    DB_USER     = 'root'
    DB_PASSWORD = 'ci_only_ephemeral_pw'
    DB_NAME     = 'reusehub'

    // ---- How Jenkins reaches Docker while running as a Windows service -----
    // Jenkins here runs as the "Local System" service account. We deliberately
    // do NOT run it as a named user: this machine signs in with a Windows
    // Hello PIN, and a PIN is not a usable service password (trying it just
    // gives a "logon failure" and Jenkins won't start). Local System has two
    // Docker blind spots, and these two variables cover both:
    //
    //   DOCKER      Local System does not have Docker's CLI on its PATH, so a
    //               bare `docker` gives "'docker' is not recognized". We invoke
    //               docker by its FULL path instead, sidestepping PATH. This is
    //               Docker Desktop's PER-USER install path (under AppData\Local)
    //               on this machine, from `where.exe docker`; update it only if
    //               Docker is later reinstalled somewhere else.
    //
    //   DOCKER_HOST Local System cannot see Docker Desktop's per-user engine
    //               pipe, so it talks to the daemon over TCP. You must enable
    //               "Expose daemon on tcp://localhost:2375 without TLS" in
    //               Docker Desktop > Settings > General. We connect via
    //               127.0.0.1 (not "localhost") to dodge the IPv6 ::1 trap,
    //               the same reason DB_HOST above is 127.0.0.1.
    DOCKER      = 'C:\\Users\\meena\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe'
    DOCKER_HOST = 'tcp://127.0.0.1:2375'
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

    stage('Database - Start MySQL (Docker)') {
      steps {
        // Remove any container left over from a previous aborted build.
        // returnStatus:true means "ignore the exit code" -- on the normal
        // path there is nothing to remove and `docker rm` would error.
        bat(script: '"%DOCKER%" rm -f %CI_DB_CONTAINER%', returnStatus: true)

        // Launch a fresh MySQL 8. -d = detached. The env vars seed the root
        // password and pre-create an empty `reusehub` database. One line on
        // purpose: mixing Windows `^` line-continuation with a Groovy string
        // is fragile, so we keep the whole command on a single line.
        bat '"%DOCKER%" run -d --name %CI_DB_CONTAINER% -e MYSQL_ROOT_PASSWORD=%DB_PASSWORD% -e MYSQL_DATABASE=%DB_NAME% -p %DB_PORT%:3306 %CI_DB_IMAGE%'

        // The container is "up" long before MySQL accepts queries. Block
        // until it truly answers, so the next stage does not connect early.
        dir('backend') {
          bat 'node scripts/wait-for-db.js'
        }
      }
    }

    stage('Database - Schema + Seed + Migrate') {
      steps {
        dir('backend') {
          // Same three steps a developer runs locally, in the same order:
          //   setup   -> create the schema from database/schema.sql
          //   seed    -> insert the demo rows the suite logs in as
          //              (e.g. aarav@example.com, used by several tests)
          //   migrate -> apply the additive, idempotent later-phase changes
          // These scripts use the mysql2 driver and read DB_* from the
          // environment above, so they target the container, not :3306.
          bat 'npm run db:setup'
          bat 'npm run db:seed'
          bat 'npm run db:migrate'
        }
      }
    }

    stage('Backend - Test (321)') {
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
      // Tear down the throwaway database no matter how the build ended, so
      // containers never accumulate. returnStatus:true keeps a failed
      // cleanup (e.g. the container was never created) from turning an
      // otherwise-green build red.
      bat(script: '"%DOCKER%" rm -f %CI_DB_CONTAINER%', returnStatus: true)
    }
    success {
      echo 'BUILD GREEN: 321 tests passed, frontend built, database torn down.'
    }
    failure {
      echo 'BUILD RED: open the failed stage and the Test Result trend to see what broke.'
    }
  }
}
