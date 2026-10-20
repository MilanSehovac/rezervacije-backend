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
  createManualBooking,
  rescheduleBooking,
} = require('../controllers/bookingController');
const { createReview } = require('../controllers/reviewController');

router.post('/', authenticate, createBooking);
router.get('/me', authenticate, getMyBookings);
router.get('/salon', authenticate, salonOwnerOnly, getSalonBookings);
router.post('/salon/manual', authenticate, salonOwnerOnly, createManualBooking);
router.post('/:id/review', authenticate, createReview);
router.patch('/:id/cancel', authenticate, cancelBooking);
router.patch('/:id/reschedule', authenticate, rescheduleBooking);
router.patch('/:id/status', authenticate, salonOwnerOnly, updateBookingStatus);

module.exports = router;
