const client = require('prom-client')

const register = new client.Registry()

// Add default process & NodeJS metrics (CPU, Memory, Event Loop lag, Heap, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'reusehub_',
})

// HTTP Request Duration Histogram
const httpRequestDurationSeconds = new client.Histogram({
  name: 'reusehub_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2.5, 5],
})

// HTTP Requests Counter
const httpRequestsTotal = new client.Counter({
  name: 'reusehub_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
})

register.registerMetric(httpRequestDurationSeconds)
register.registerMetric(httpRequestsTotal)

function metricsMiddleware(req, res, next) {
  // Don't trace internal metrics calls to avoid skewing data
  if (req.path === '/metrics') {
    return next()
  }

  const start = process.hrtime()

  res.on('finish', () => {
    const diff = process.hrtime(start)
    const durationInSeconds = diff[0] + diff[1] / 1e9

    // Normalize path to prevent high cardinality
    const route = req.baseUrl || req.route?.path || req.path || 'unknown'
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
    }

    httpRequestsTotal.inc(labels)
    httpRequestDurationSeconds.observe(labels, durationInSeconds)
  })

  next()
}

async function metricsHandler(req, res) {
  try {
    res.setHeader('Content-Type', register.contentType)
    res.send(await register.metrics())
  } catch (error) {
    res.status(500).send(error.message)
  }
}

module.exports = {
  register,
  metricsMiddleware,
  metricsHandler,
}
