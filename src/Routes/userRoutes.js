const express = require('express');
const router = express.Router()
const {getUser, createUser, userLogin, getMe, logout, updateUserProfile} = require('../controllers/userController')
const {authenticate} = require('../middleware/auth');

router.get('/me', authenticate, getMe)
router.post('/', createUser)
router.post('/login', userLogin)
router.post('/logout', logout);
router.put('/me', authenticate, updateUserProfile)
module.exports = router