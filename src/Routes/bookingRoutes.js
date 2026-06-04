const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { salonOwnerOnly } = require('../middleware/salon');
const {
  createBooking,
  getMyBookings,
  cancelBooking,
  getSalonBookings,
  updateBookingStatus,
} = require('../controllers/bookingController');

router.post('/', authenticate, createBooking);
router.get('/me', authenticate, getMyBookings);
router.get('/salon', authenticate, salonOwnerOnly, getSalonBookings);
router.patch('/:id/cancel', authenticate, cancelBooking);
router.patch('/:id/status', authenticate, salonOwnerOnly, updateBookingStatus);

module.exports = router;
