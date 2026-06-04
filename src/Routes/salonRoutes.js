const express = require('express');
const router = express.Router()
const {getSalonById, createSalon, getAllSalons} = require('../controllers/salonController')
const { getSalonAvailability } = require('../controllers/availabilityController')
const {authenticate} = require('../middleware/auth')

router.get('/:id/availability', getSalonAvailability)
router.get('/:id', getSalonById)
router.get('/', getAllSalons)
router.post('/create', authenticate ,createSalon)

module.exports = router