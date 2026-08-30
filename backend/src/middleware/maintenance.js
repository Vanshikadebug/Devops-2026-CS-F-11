const settingsModel = require('../models/settingsModel')
const userModel = require('../models/userModel')
const { verifyToken } = require('../utils/token')
const { isStaff } = require('./authorize')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

async function maintenance(req, res, next) {
  try {
    if (SAFE_METHODS.has(req.method)) return next()

    // Auth must keep working: staff need to log in to turn maintenance off.
    if (req.path.startsWith('/auth/')) return next()

    if (!(await settingsModel.get('maintenance_mode'))) return next()

    if (await callerIsStaff(req)) return next()

    const [message, email] = await Promise.all([
      settingsModel.get('maintenance_message'),
      settingsModel.get('support_email'),
    ])

    return res.status(503).json({
      success: false,
      message: message || 'ReuseHub is briefly down for maintenance.',
      maintenance: true,
      ...(email ? { supportEmail: email } : {}),
    })
  } catch (err) {
    return next(err)
  }
}

/** True when the request carries a valid token for a staff account. Any
    failure resolves to false: an unreadable token is simply not staff. */
async function callerIsStaff(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return false

  try {
    const { id } = verifyToken(header.slice(7))
    const user = await userModel.findById(id)
    return isStaff(user)
  } catch {
    return false
  }
}

module.exports = maintenance
