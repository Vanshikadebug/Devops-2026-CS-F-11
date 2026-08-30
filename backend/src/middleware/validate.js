const { validationResult } = require('express-validator')
const ApiError = require('../utils/ApiError')

function validate(req, _res, next) {
  const result = validationResult(req)

  if (result.isEmpty()) return next()

  const details = result.array().map((err) => ({
    field: err.path || err.param,
    message: err.msg,
  }))

  next(ApiError.badRequest('Please correct the highlighted fields', details))
}

module.exports = validate
