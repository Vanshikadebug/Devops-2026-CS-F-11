/**
 * server.js -- the process entry point.
 *
 * Its only job is to take the app built in app.js and attach it to
 * a real TCP port, plus handle the messy realities of being a
 * long-running process: crashes and shutdown signals.
 *
 * Keeping this separate from app.js is what lets the test suite
 * import the app without opening a port (see the note in app.js).
 */

const app = require('./app')
const config = require('./config/env')

const server = app.listen(config.port, () => {
  console.log('')
  console.log('  ♻  ReuseHub API')
  console.log(`     listening on  http://localhost:${config.port}`)
  console.log(`     health check  http://localhost:${config.port}/api/health`)
  console.log(`     environment   ${config.nodeEnv}`)
  console.log('')
})

/* ---------------------------------------------------------------
   PORT ALREADY IN USE
   Node's default message for this is a wall of stack trace that
   does not say what to do. Since Jenkins occupies 8080 on this
   machine, port clashes are a realistic failure -- so we catch it
   and print something actionable.
--------------------------------------------------------------- */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n[server] FATAL: port ${config.port} is already in use.\n` +
        `         Another program is listening there. Either stop it, or\n` +
        `         set a different PORT in backend/.env\n\n` +
        `         Find the culprit on Windows with:\n` +
        `           netstat -ano | findstr :${config.port}\n`,
    )
    process.exit(1)
  }
  throw err
})

/* ---------------------------------------------------------------
   GRACEFUL SHUTDOWN
   When you press Ctrl+C (SIGINT), or Docker stops the container
   (SIGTERM), the default behaviour is to kill the process
   instantly -- cutting off requests that are mid-flight and leaving
   database connections dangling.

   server.close() instead stops accepting NEW connections and lets
   in-flight requests finish first. This matters in Phase 13:
   Docker sends SIGTERM, waits ~10 seconds, then force-kills. A
   container that handles SIGTERM shuts down cleanly and instantly
   instead of hanging for the full timeout on every restart.
--------------------------------------------------------------- */
function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down gracefully…`)

  server.close(() => {
    console.log('[server] closed remaining connections. Goodbye.')
    process.exit(0)
  })

  // Safety net: if something hangs, do not wait forever.
  setTimeout(() => {
    console.error('[server] shutdown timed out, forcing exit')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

/* ---------------------------------------------------------------
   LAST-RESORT CRASH HANDLERS
   These catch bugs that escaped every try/catch. We log and exit
   rather than continuing, because after an unhandled exception the
   process is in an unknown state -- carrying on can corrupt data.
   Exiting is safe here: nodemon restarts it in development, and
   Docker's restart policy does so in production.
--------------------------------------------------------------- */
process.on('unhandledRejection', (reason) => {
  console.error('\n[server] UNHANDLED PROMISE REJECTION -- shutting down')
  console.error(reason)
  server.close(() => process.exit(1))
})

process.on('uncaughtException', (err) => {
  console.error('\n[server] UNCAUGHT EXCEPTION -- shutting down')
  console.error(err)
  process.exit(1)
})

module.exports = server
