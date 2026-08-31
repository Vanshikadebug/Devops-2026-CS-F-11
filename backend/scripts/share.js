#!/usr/bin/env node
/**
 * Publishes the running stack's API on a public HTTPS URL and prints what a
 * teammate needs to paste into their frontend/.env.
 *
 *   npm run share
 *
 * Runs cloudflared as a compose service (the `share` profile), so nothing has
 * to be installed locally and the tunnel reaches the api container directly
 * over the compose network.
 *
 * HTTPS matters: a browser on an https page refuses to call a plain http API
 * (mixed content), so handing out a LAN IP would not work for a remote teammate.
 */

const { spawn, spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i
const TIMEOUT_MS = 90_000

const compose = (args, opts = {}) =>
  spawnSync('docker', ['compose', ...args], { cwd: ROOT, shell: true, encoding: 'utf8', ...opts })

function die(message, hint) {
  console.error(`\n[share] ${message}`)
  if (hint) console.error(hint)
  process.exit(1)
}

function main() {
  if (compose(['version']).status !== 0) {
    die('Docker is not available.', '        Start Docker Desktop and try again.')
  }

  // The tunnel forwards to the api *container*, so the stack has to be up.
  const running = compose(['ps', '--services', '--filter', 'status=running']).stdout || ''
  if (!running.split('\n').map((s) => s.trim()).includes('api')) {
    die('The api service is not running.', '        Start the stack first:  npm run docker:up')
  }

  console.log('[share] starting tunnel…')
  const up = compose(['--profile', 'share', 'up', '-d', 'tunnel'], { stdio: 'inherit' })
  if (up.status !== 0) die('Could not start the tunnel container.')

  // The URL is only ever printed in the container log, so tail it until it
  // appears rather than polling some API.
  const logs = spawn('docker', ['compose', '--profile', 'share', 'logs', '-f', 'tunnel'], {
    cwd: ROOT,
    shell: true,
  })

  let done = false

  const timer = setTimeout(() => {
    if (done) return
    logs.kill()
    die(
      'Timed out waiting for the tunnel URL.',
      '        Check the log:  docker compose --profile share logs tunnel',
    )
  }, TIMEOUT_MS)

  const scan = (buf) => {
    const match = buf.toString().match(URL_RE)
    if (!match || done) return
    done = true
    clearTimeout(timer)
    logs.kill()
    announce(match[0])
  }

  logs.stdout.on('data', scan)
  logs.stderr.on('data', scan)
}

function announce(url) {
  const bar = '='.repeat(70)
  console.log(`
${bar}
  Your backend is live at:

      ${url}

  Send your teammate this one line for their  frontend/.env :

      VITE_API_URL=${url}

  They then need nothing else — no database, no Redis, no backend:

      cd frontend
      npm install
      npm run dev          ->  http://localhost:5173

  Verify it from anywhere:   ${url}/api/health
${bar}

  The tunnel keeps running in the background, even if you close this terminal.
    stop it   ->  npm run share:stop
    view log  ->  docker compose --profile share logs -f tunnel

  The URL changes every time the tunnel restarts, so re-run npm run share and
  resend the new one if you restart it.
`)
}

main()
