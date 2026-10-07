// =============================================================================
//  ReuseHub -- Jenkins pipeline
// =============================================================================
//
//  GitHub ──push──▶ Jenkins ──▶ test ──▶ build images ──▶ (main) deploy + smoke
//     ▲                                                        │
//     └───────────── feedback/feedback.txt commit (main) ◀─────┘
//
//  ONE BUILD, IN ORDER
//    1. Checkout              the pushed commit
//    2. Backend  - Install    npm ci + prisma generate (MongoDB client)
//    3. Backend  - Test       Jest + Supertest (no database needed)
//    4. Frontend - Install
//    5. Frontend - Lint+Build Vite production bundle, archived as an artifact
//    6. Docker   - Build      api + web images, tagged with the build number
//    7. Docker   - Push       to Docker Hub (main only, when configured)
//    8. Deploy               docker compose up (main only): MongoDB, mongo-express,
//                             API, web, Prometheus, Grafana, MongoDB exporter
//    9. Smoke test            scripts/smoke.js against the deployed API
//
//  Branch builds (e.g. a PR branch) run 1-6 only: they prove the change builds
//  and passes tests without replacing the running stack.
//
//  TRIGGERS -- see JENKINS_SETUP.md
//    * GitHub webhook (instant): tick "GitHub hook trigger for GITScm polling"
//      on the job and point a GitHub webhook at <jenkins-url>/github-webhook/.
//    * pollSCM below is the fallback for a localhost Jenkins GitHub cannot reach.
//
//  CREDENTIALS (Manage Jenkins > Credentials) -- none are stored in this file
//    github-token        Username + GitHub PAT, to push the feedback commit
//    dockerhub           Username + Docker Hub access token (optional; set the
//                        DOCKERHUB_NAMESPACE global env var to enable stage 7)
//
//  AGENT: Windows or Linux. Every shell step goes through runCmd(), which picks
//  `bat` or `sh`. `node`, `npm` and `docker` must be on the agent's PATH.
// =============================================================================

def runCmd(String cmd) {
  if (isUnix()) { sh cmd } else { bat cmd }
}

def onMain() {
  def branch = (env.BRANCH_NAME ?: env.GIT_BRANCH ?: '').replaceFirst('^origin/', '')
  return branch == 'main'
}

pipeline {
  agent any

  // If npm is NOT on the Jenkins account's PATH, install the "NodeJS" plugin,
  // add a Node install under Manage Jenkins > Tools named exactly "node20",
  // then uncomment this block.
  // tools {
  //   nodejs 'node20'
  // }

  options {
    timestamps()
    timeout(time: 45, unit: 'MINUTES')
    // Two deploys at once would fight over the same containers.
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  triggers {
    pollSCM('H/2 * * * *')
  }

  environment {
    // Images are tagged per build so a deploy is traceable to its build.
    IMAGE_TAG = "${env.BUILD_NUMBER}"
    // CI never needs a real secret: Jest runs with NODE_ENV=test.
    JWT_SECRET = 'ci_only_ephemeral_jwt_secret'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Skip Jenkins feedback commit') {
      steps {
        script {
          def message = isUnix()
            ? sh(script: 'git log -1 --pretty=%B', returnStdout: true)
            : bat(script: '@git log -1 --pretty=%%B', returnStdout: true)
          if (message.contains('docs: update Jenkins test feedback')) {
            env.SKIP_JENKINS_FEEDBACK = 'true'
            currentBuild.result = 'NOT_BUILT'
            error('Commit was made by Jenkins itself -- nothing to build.')
          }
        }
      }
    }

    stage('Backend - Install') {
      steps {
        dir('backend') {
          runCmd 'npm ci'
          runCmd 'npx prisma generate'
        }
      }
    }

    stage('Backend - Test') {
      steps {
        script {
          env.TEST_STATUS = 'FAILED'
          dir('backend') {
            runCmd 'npm test'
          }
          env.TEST_STATUS = 'PASSED'
        }
      }
    }

    stage('Frontend - Install') {
      steps {
        dir('frontend') {
          runCmd 'npm ci'
        }
      }
    }

    stage('Frontend - Lint + Build') {
      steps {
        dir('frontend') {
          runCmd 'npm run lint'
          runCmd 'npm run build'
        }
        archiveArtifacts artifacts: 'frontend/dist/**', fingerprint: true
      }
    }

    stage('Docker - Build') {
      steps {
        runCmd 'docker version'
        runCmd 'docker compose build api web'
      }
    }

    stage('Docker - Push') {
      when {
        expression { onMain() && env.DOCKERHUB_NAMESPACE?.trim() }
      }
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DH_USER', passwordVariable: 'DH_TOKEN')]) {
          script {
            def ns = env.DOCKERHUB_NAMESPACE.trim()
            if (isUnix()) {
              sh 'echo "$DH_TOKEN" | docker login -u "$DH_USER" --password-stdin'
            } else {
              bat '@echo %DH_TOKEN%| docker login -u %DH_USER% --password-stdin'
            }
            for (svc in ['api', 'web']) {
              runCmd "docker tag reusehub-${svc}:${env.IMAGE_TAG} ${ns}/reusehub-${svc}:${env.IMAGE_TAG}"
              runCmd "docker tag reusehub-${svc}:${env.IMAGE_TAG} ${ns}/reusehub-${svc}:latest"
              runCmd "docker push ${ns}/reusehub-${svc}:${env.IMAGE_TAG}"
              runCmd "docker push ${ns}/reusehub-${svc}:latest"
            }
          }
        }
      }
    }

    stage('Deploy') {
      when { expression { onMain() } }
      steps {
        // `up -d` replaces only containers whose image or config changed; the
        // MongoDB volume (all app data) survives every deploy.
        runCmd 'docker compose up -d --remove-orphans --wait --wait-timeout 300'
        runCmd 'docker compose ps'
      }
    }

    stage('Smoke test') {
      when { expression { onMain() } }
      steps {
        dir('backend') {
          withEnv(['SMOKE_WAIT=120']) {
            runCmd 'node scripts/smoke.js'
          }
        }
      }
    }
  }

  post {
    always {
      script {
        if (env.SKIP_JENKINS_FEEDBACK == 'true') {
          return
        }

        def feedback = """
========================================
        JENKINS TEST FEEDBACK
========================================

Project       : DevOps-2026-CS-F-11
Build Number  : ${env.BUILD_NUMBER}
Branch        : ${env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'unknown'}
Commit        : ${env.GIT_COMMIT ?: 'unknown'}

Build Status  : ${currentBuild.currentResult}
Test Status   : ${env.TEST_STATUS ?: 'NOT EXECUTED'}

Date          : ${new Date()}
Jenkins Job   : ${env.JOB_NAME}

========================================
"""
        writeFile(file: 'feedback/feedback.txt', text: feedback)
        archiveArtifacts(artifacts: 'feedback/feedback.txt', fingerprint: true)

        // Only builds of main write back to main. A branch build pushing to
        // main would overwrite main with the branch's HEAD.
        if (!onMain()) {
          echo 'Branch build: feedback archived, not committed.'
          return
        }

        // Non-fatal: if main moved on during the build the push is rejected,
        // and that must not turn a green build red.
        catchError(buildResult: 'SUCCESS', stageResult: 'SUCCESS', message: 'feedback push skipped') {
        withCredentials([usernamePassword(credentialsId: 'github-token', usernameVariable: 'GIT_USERNAME', passwordVariable: 'GIT_TOKEN')]) {
          def push = '''
            git config user.name "Jenkins"
            git config user.email "jenkins@localhost"
            git add feedback/feedback.txt
            git diff --cached --quiet || git commit -m "docs: update Jenkins test feedback [skip ci]"
          '''
          if (isUnix()) {
            sh push + '\ngit push "https://$GIT_USERNAME:$GIT_TOKEN@github.com/Vanshikadebug/Devops-2026-CS-F-11.git" HEAD:main'
          } else {
            bat push.readLines().findAll { it.trim() }.collect { it.trim() }.join('\r\n') +
              '\r\ngit push https://%GIT_USERNAME%:%GIT_TOKEN%@github.com/Vanshikadebug/Devops-2026-CS-F-11.git HEAD:main'
          }
        }
        }
      }
    }

    success {
      echo 'BUILD GREEN'
    }

    failure {
      echo 'BUILD RED: see the first red stage above.'
    }
  }
}
