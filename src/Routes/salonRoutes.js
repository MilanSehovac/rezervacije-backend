const express = require('express');
const router = express.Router()
const {getSalon, createSalon} = require('../controllers/salonController')

router.get('/', getSalon)
router.post('/', createSalon)

module.exports = router