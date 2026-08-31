const express = require('express')
const {
  getItems,
  getItemById,
  getMyItems,
  createItem,
  updateItem,
  updateItemStatus,
  deleteItem,
} = require('../controllers/itemController')
const { createRules, updateRules, statusRules } = require('../validators/itemValidators')
const validate = require('../middleware/validate')
const protect = require('../middleware/protect')
const checkItemOwnership = require('../middleware/checkItemOwnership')

const router = express.Router()

router.get('/mine', protect, getMyItems)

router.get('/', getItems)
router.get('/:id', getItemById)

router.post('/', protect, createRules, validate, createItem)

router.put('/:id', protect, checkItemOwnership, updateRules, validate, updateItem)

/* PATCH, not PUT: the body is one field out of eight, which is a
   partial modification by definition. See the note on
   updateItemStatus in the controller. */
router.patch('/:id/status', protect, checkItemOwnership, statusRules, validate, updateItemStatus)

router.delete('/:id', protect, checkItemOwnership, deleteItem)

module.exports = router
