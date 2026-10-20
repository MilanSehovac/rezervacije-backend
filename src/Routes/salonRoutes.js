const express = require('express');
const router = express.Router()
const {
  getSalonById, createSalon, getAllSalons,
  getMySalon, updateMySalon,
  addService, updateService, deleteService,
  addTeamMember, updateTeamMember, deleteTeamMember,
  uploadImages, deleteImage,
} = require('../controllers/salonController')
const { getSalonAvailability } = require('../controllers/availabilityController')
const { authenticate, optionalAuthenticate } = require('../middleware/auth')
const { salonOwnerOnly } = require('../middleware/salon')
const { uploadImages: uploadMiddleware } = require('../middleware/upload')
const { getSalonReviews } = require('../controllers/reviewController')
const blocked = require('../controllers/blockedTimeController')

router.get('/', getAllSalons)
router.post('/create', authenticate, createSalon)

// Owner management. Must be declared before '/:id'.
router.get('/me', authenticate, salonOwnerOnly, getMySalon)
router.put('/me', authenticate, salonOwnerOnly, updateMySalon)
router.post('/me/services', authenticate, salonOwnerOnly, addService)
router.put('/me/services/:serviceId', authenticate, salonOwnerOnly, updateService)
router.delete('/me/services/:serviceId', authenticate, salonOwnerOnly, deleteService)
router.post('/me/images', authenticate, salonOwnerOnly, (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (!err) return next()
    if (err.message === 'INVALID_FILE_TYPE') return res.status(400).json({ error: 'Only JPEG, PNG or WebP images are allowed' })
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Each image can be at most 5 MB' })
    return res.status(400).json({ error: 'Invalid upload' })
  })
}, uploadImages)
router.delete('/me/images', authenticate, salonOwnerOnly, deleteImage)
router.get('/me/blocked', authenticate, salonOwnerOnly, blocked.list)
router.post('/me/blocked', authenticate, salonOwnerOnly, blocked.create)
router.delete('/me/blocked/:id', authenticate, salonOwnerOnly, blocked.remove)
router.post('/me/team', authenticate, salonOwnerOnly, addTeamMember)
router.put('/me/team/:memberId', authenticate, salonOwnerOnly, updateTeamMember)
router.delete('/me/team/:memberId', authenticate, salonOwnerOnly, deleteTeamMember)

router.get('/:id/availability', optionalAuthenticate, getSalonAvailability)
router.get('/:id/reviews', getSalonReviews)
router.get('/:id', optionalAuthenticate, getSalonById)

module.exports = router
