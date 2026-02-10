const express = require('express');
const router = express.Router()
const {getSalon, createSalon} = require('../controllers/salonController')
const { salonOwnerOnly } = require('../middleware/salon');

router.get('/', getSalon)
router.post('/create', salonOwnerOnly ,createSalon)

module.exports = router