const jwt = require('jsonwebtoken')
const config = require('../config/env')

function signToken(userId) {
  return jwt.sign(
    { id: userId }, // the payload -- deliberately nothing else
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  )
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret)
}

module.exports = { signToken, verifyToken }
