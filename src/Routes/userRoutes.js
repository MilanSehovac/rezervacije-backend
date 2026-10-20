const express = require('express');
const router = express.Router()
const {getUser, createUser, userLogin, getMe, logout, updateUserProfile, updateNotificationPrefs, changePassword, deleteAccount} = require('../controllers/userController')
const {authenticate} = require('../middleware/auth');

router.get('/me', authenticate, getMe)
router.post('/', createUser)
router.post('/login', userLogin)
router.post('/logout', logout);
router.put('/me', authenticate, updateUserProfile)
router.put('/me/notifications', authenticate, updateNotificationPrefs)
router.post('/me/password', authenticate, changePassword)
router.delete('/me', authenticate, deleteAccount)
module.exports = router