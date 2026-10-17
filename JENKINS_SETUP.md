# CI/CD Setup — ReuseHub

```
developer ──git push──▶ GitHub ──webhook / poll──▶ Jenkins ──▶ Docker (compose)
                          │                           │           MongoDB · mongo-express
                          │                           │           API · web · Redis
                          ▼                           │           Prometheus · Grafana
                   GitHub Actions                     ▼
            test ▸ build images ▸ boot stack   feedback/feedback.txt
            ▸ smoke test ▸ push to ghcr.io     committed back to main
```

Two pipelines run on every push, and both must be green before merging:

| | Runs on | Does |
|---|---|---|
| **GitHub Actions** (`.github/workflows/ci.yml`) | GitHub's servers | Tests, builds both Docker images, boots the **whole** compose stack, runs the end-to-end smoke test; on `main`, publishes the images to GitHub Container Registry |
| **Jenkins** (`Jenkinsfile`) | Your own machine | The same tests and image build; on `main`, **deploys** the stack on that machine and smoke-tests it |

---

## 1. What the Jenkins pipeline does

| Stage | Every branch | `main` only |
|---|---|---|
| Checkout | ✓ | |
| Skip Jenkins feedback commit | ✓ | |
| Backend - Install (`npm ci`, `prisma generate`) | ✓ | |
| Backend - Test (Jest, no database needed) | ✓ | |
| Frontend - Install | ✓ | |
| Frontend - Lint + Build (bundle archived) | ✓ | |
| Docker - Build (`reusehub-api`, `reusehub-web`, tagged with the build number) | ✓ | |
| Docker - Push (Docker Hub) | | ✓ if configured |
| Deploy (`docker compose up -d --wait`) | | ✓ |
| Smoke test (`backend/scripts/smoke.js`) | | ✓ |
| Feedback file committed to `main` | | ✓ |

A branch build never deploys and never pushes to `main`.

## 2. Prerequisites on the Jenkins machine

1. **Jenkins** (LTS) with the default recommended plugins (Pipeline, Git,
   GitHub, Credentials Binding, Timestamper).
2. **Node.js 20+** on the PATH of the account Jenkins runs as. If it isn't,
   install the *NodeJS* plugin, add a Node install named `node20` under
   *Manage Jenkins → Tools*, and uncomment the `tools` block in the Jenkinsfile.
3. **Docker Desktop**, running, with `docker` on Jenkins' PATH.
   On Windows the Jenkins service must be allowed to talk to Docker: either run
   the Jenkins service as your own Windows user (*services.msc → Jenkins → Log
   On*), or add the service account to the local `docker-users` group, then
   restart Jenkins. Check with a build: the *Docker - Build* stage starts with
   `docker version`.
4. Free host ports: 3000 (web), 5000 (API), 8081 (mongo-express), 3005
   (Grafana), 9091 (Prometheus), 27017 (MongoDB), 6380 (Redis). Change any of
   them in a root `.env` (see `.env.example`).

No database setup is needed: the stack brings its own MongoDB.

## 3. Create the job

*New Item → Pipeline* (name e.g. `reusehub`), then:

- **Build Triggers:** tick **GitHub hook trigger for GITScm polling** (see §5).
- **Pipeline → Definition:** *Pipeline script from SCM*
  - SCM: Git, Repository URL `https://github.com/Vanshikadebug/Devops-2026-CS-F-11.git`
  - Branch specifier: `*/main`
  - Script path: `Jenkinsfile`

Want every branch and pull request built too? Use *New Item → Multibranch
Pipeline* with the same repository instead; the Jenkinsfile already restricts
deploys to `main`.

Click **Build Now** once — Jenkins only learns the triggers after a first run.

## 4. Credentials (*Manage Jenkins → Credentials → Global*)

| ID | Kind | Used for |
|---|---|---|
| `github-token` | Username + password: your GitHub username and a **personal access token** with `repo` scope | Pushing `feedback/feedback.txt` to `main` |
| `dockerhub` *(optional)* | Username + password: Docker Hub username and an **access token** | The *Docker - Push* stage |

To turn the Docker Hub push on, also add a global environment variable
`DOCKERHUB_NAMESPACE` = your Docker Hub username (*Manage Jenkins → System →
Global properties → Environment variables*). Without it the stage is skipped.

Each person uses **their own** GitHub token. Never share account passwords —
the repo owner adds teammates as collaborators instead.

## 5. GitHub → Jenkins trigger

**Webhook (instant).** GitHub must be able to reach Jenkins, so a Jenkins on
`localhost` needs a public tunnel first:

```bash
cloudflared tunnel --url http://localhost:8080
```

Then in GitHub: *repo → Settings → Webhooks → Add webhook*

- Payload URL: `https://<your-tunnel-host>/github-webhook/` (trailing slash matters)
- Content type: `application/json`
- Events: *Just the push event*

GitHub shows a green tick next to the webhook after its first delivery.

**Polling (fallback, no setup).** The Jenkinsfile also polls GitHub about every
2 minutes, so pushes still build when no webhook can reach the machine.

Either way Jenkins sees **pushed** commits only — commit, then `git push`.

## 6. GitHub Actions and the container registry

Nothing to configure: the workflow uses the repository's built-in
`GITHUB_TOKEN`. After a push to `main`, the images appear under the repo
owner's *Packages*:

```
ghcr.io/<owner>/reusehub-api:latest   ghcr.io/<owner>/reusehub-api:<commit-sha>
ghcr.io/<owner>/reusehub-web:latest   ghcr.io/<owner>/reusehub-web:<commit-sha>
```

## 7. After a `main` deploy

| | |
|---|---|
| Website | http://localhost:3000 |
| API health | http://localhost:5000/api/health |
| mongo-express | http://localhost:8081 — `admin` / `reusehub` |
| Grafana | http://localhost:3005 — `admin` / `admin` (dashboards: *ReuseHub - Detailed App Metrics*, *ReuseHub - MongoDB*) |
| Prometheus | http://localhost:9091/targets — `reusehub-api`, `mongodb`, `prometheus` all UP |

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `'npm' is not recognized` | Node is not on the Jenkins account's PATH — see §2.2 |
| `'docker' is not recognized` or `open //./pipe/docker_engine: Access is denied` | See §2.3; restart Jenkins after changing its account or groups |
| `Bind for 0.0.0.0:<port> failed: port is already allocated` | Another program holds the port; set a different one in the root `.env` |
| `mongodb` unhealthy, log says *Invalid featureCompatibilityVersion* | The `mongodb_data` volume was created by a newer MongoDB than the pinned image. Keep the image at or above that version |
| Grafana rejects `admin` / `admin` | The password was changed earlier and is stored in the `grafana-data` volume; use that password (or reset with `docker compose exec grafana grafana cli admin reset-admin-password <new>`) |
| Feedback push skipped | `main` moved during the build; harmless, the next build commits it |
