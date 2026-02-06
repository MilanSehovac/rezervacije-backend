const express = require('express');
const router = express.Router()
const {getUser, createUser, userLogin, getMe, logout} = require('../controllers/userController')
const {authenticate} = require('../middleware/auth');

router.get('/', getUser)
router.get('/me', authenticate, getMe)
router.post('/', createUser)
router.post('/login', userLogin)
router.post('/logout', logout);
module.exports = router