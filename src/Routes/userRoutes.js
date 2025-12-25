const express = require('express');
const router = express.Router()
const {getUser, createUser, userLogin} = require('../controllers/userController')

router.get('/', getUser)
router.post('/', createUser)
router.post('/login', userLogin)

module.exports = router