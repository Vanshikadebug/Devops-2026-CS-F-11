const express = require('express')

const {
  getOverview,
  listUsers,
  getUser,
  setUserStatus,
  setUserRole,
  listItems,
  getItem,
  setItemModeration,
  listReports,
  getReport,
  reviewReport,
  listAudit,
  getDashboard,
} = require('../controllers/adminController')
const settingsController = require('../controllers/settingsController')
const taxonomyController = require('../controllers/taxonomyController')
const locationController = require('../controllers/adminLocationController')
const contentController = require('../controllers/contentController')

const { statusRules, roleRules, moderationRules, reportRules } = require('../validators/adminValidators')
const validate = require('../middleware/validate')
const protect = require('../middleware/protect')
const { requireStaff, requireAdmin, requireSuperAdmin } = require('../middleware/authorize')

const router = express.Router()

router.use(protect)

router.get('/dashboard', requireStaff, getDashboard)
router.get('/overview', requireStaff, getOverview)

// --- Content moderation (staff) ---------------------------------------
router.get('/items', requireStaff, listItems)
router.get('/items/:id', requireStaff, getItem)
router.patch('/items/:id/moderation', requireStaff, moderationRules, validate, setItemModeration)

router.get('/reports', requireStaff, listReports)
router.get('/reports/:id', requireStaff, getReport)
router.patch('/reports/:id/review', requireStaff, reportRules, validate, reviewReport)

// --- Accounts (admin; role changes super-admin) ------------------------
router.get('/users', requireAdmin, listUsers)
router.get('/users/:id', requireAdmin, getUser)
router.patch('/users/:id/status', requireAdmin, statusRules, validate, setUserStatus)
router.patch('/users/:id/role', requireSuperAdmin, roleRules, validate, setUserRole)

// --- Platform settings (admin) ----------------------------------------
router.get('/settings', requireAdmin, settingsController.getSettings)
router.put('/settings', requireAdmin, settingsController.updateSettings)

// --- Taxonomy (admin) --------------------------------------------------
router.get('/categories', requireAdmin, taxonomyController.listCategories)
router.post('/categories', requireAdmin, taxonomyController.createCategory)
router.patch('/categories/:id', requireAdmin, taxonomyController.updateCategory)
router.delete('/categories/:id', requireAdmin, taxonomyController.removeCategory)

router.get('/conditions', requireAdmin, taxonomyController.listConditions)
router.post('/conditions', requireAdmin, taxonomyController.createCondition)
router.patch('/conditions/:id', requireAdmin, taxonomyController.updateCondition)
router.delete('/conditions/:id', requireAdmin, taxonomyController.removeCondition)

// --- Location directory (admin) ---------------------------------------
router.get('/locations/cities', requireAdmin, locationController.listCities)
router.post('/locations/cities', requireAdmin, locationController.createCity)
router.patch('/locations/cities/:id', requireAdmin, locationController.updateCity)
router.delete('/locations/cities/:id', requireAdmin, locationController.removeCity)

router.get('/locations/areas', requireAdmin, locationController.listAreas)
router.post('/locations/areas', requireAdmin, locationController.createArea)
router.patch('/locations/areas/:id', requireAdmin, locationController.updateArea)
router.delete('/locations/areas/:id', requireAdmin, locationController.removeArea)

router.get('/locations/colleges', requireAdmin, locationController.listColleges)
router.post('/locations/colleges', requireAdmin, locationController.createCollege)
router.patch('/locations/colleges/:id', requireAdmin, locationController.updateCollege)
router.delete('/locations/colleges/:id', requireAdmin, locationController.removeCollege)

// --- Site chrome (admin) ----------------------------------------------
router.get('/nav-links', requireAdmin, contentController.listNavLinks)
router.post('/nav-links', requireAdmin, contentController.createNavLink)
router.patch('/nav-links/:id', requireAdmin, contentController.updateNavLink)
router.delete('/nav-links/:id', requireAdmin, contentController.removeNavLink)

router.get('/social-links', requireAdmin, contentController.listSocialLinks)
router.post('/social-links', requireAdmin, contentController.createSocialLink)
router.patch('/social-links/:id', requireAdmin, contentController.updateSocialLink)
router.delete('/social-links/:id', requireAdmin, contentController.removeSocialLink)

// --- Audit trail (admin) ----------------------------------------------
router.get('/audit', requireAdmin, listAudit)

module.exports = router
