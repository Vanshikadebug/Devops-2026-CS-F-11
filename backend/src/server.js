const app = require('./app')
const config = require('./config/env')
const { testPrismaConnection, disconnectPrisma } = require('./lib/prisma')
const { disconnectRedis } = require('./lib/redis')

testPrismaConnection()
  .then(() => console.log('[server] database connection ok'))
  .catch(() => {
    console.warn('[server] starting WITHOUT a database connection.')
    console.warn('[server] /api/health responds; data routes will fail until the DB is reachable.')
  })

const server = app.listen(config.port, () => {
  console.log('')
  console.log('  ReuseHub API')
  console.log(`     listening on  http://localhost:${config.port}`)
  console.log(`     health check  http://localhost:${config.port}/api/health`)
  console.log(`     environment   ${config.nodeEnv}`)
  console.log('')
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n[server] FATAL: port ${config.port} is already in use.\n` +
        `         Stop the other process, or set a different PORT.\n`,
    )
    process.exit(1)
  }
  throw err
})

function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down...`)
  server.close(async () => {
    await Promise.all([
      disconnectPrisma().catch(() => {}),
      disconnectRedis().catch(() => {}),
    ])
    console.log('[server] closed remaining connections. Goodbye.')
    process.exit(0)
  })
  setTimeout(() => {
    console.error('[server] shutdown timed out, forcing exit')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

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
