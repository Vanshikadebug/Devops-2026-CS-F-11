const settingsModel = require('../models/settingsModel')
const taxonomyModel = require('../models/taxonomyModel')
const contentModel = require('../models/contentModel')
const locationModel = require('../models/locationModel')
const asyncHandler = require('../utils/asyncHandler')
const cache = require('../lib/cache')
const config = require('../config/env')

async function buildConfig() {
  const [settings, categories, conditions, nav, social, cities] = await Promise.all([
    settingsModel.getPublicMap(),
    taxonomyModel.activeCategories(),
    taxonomyModel.activeConditions(),
    contentModel.activeNavLinks(),
    contentModel.activeSocialLinks(),
    locationModel.findCities(),
  ])

  return {
    settings,
    categories,
    conditions,
    nav,
    social,
    cities,
  }
}

const getConfig = asyncHandler(async (req, res) => {
  const data = config.isTest
    ? await buildConfig()
    : await cache.wrap(cache.KEYS.config, config.redis.ttl.config, buildConfig)

  res.status(200).json({ success: true, data })
})

module.exports = { getConfig, buildConfig }
