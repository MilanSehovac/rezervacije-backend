const { fn, col } = require('sequelize');
const { Review, Booking, Salon, User } = require('../models');

const MAX_COMMENT = 1000;

/** { [salonId]: { rating, reviewCount } } for the given salon ids. */
exports.ratingSummaries = async (salonIds) => {
  if (!salonIds.length) return {};
  const rows = await Review.findAll({
    where: { salonId: salonIds },
    attributes: ['salonId', [fn('AVG', col('rating')), 'avg'], [fn('COUNT', col('id')), 'count']],
    group: ['salonId'],
    raw: true,
  });
  const out = {};
  for (const r of rows) out[r.salonId] = { rating: Math.round(Number(r.avg) * 10) / 10, reviewCount: Number(r.count) };
  return out;
};

// POST /bookings/:id/review
exports.createReview = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking || booking.customerId !== req.user.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'You can review a booking once it is completed' });
    }

    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5' });
    }
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, MAX_COMMENT) : '';

    if (await Review.findOne({ where: { bookingId: booking.id } })) {
      return res.status(409).json({ error: 'You already reviewed this booking' });
    }

    const review = await Review.create({
      salonId: booking.salonId,
      customerId: req.user.id,
      bookingId: booking.id,
      rating,
      comment: comment || null,
    });
    res.status(201).json(review);
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({ error: 'Failed to create review' });
  }
};

// GET /salon/:id/reviews
exports.getSalonReviews = async (req, res) => {
  try {
    const salon = await Salon.findByPk(req.params.id, { attributes: ['id', 'isApproved'] });
    if (!salon || !salon.isApproved) return res.status(404).json({ error: 'Salon not found' });

    const reviews = await Review.findAll({
      where: { salonId: salon.id },
      include: [{ model: User, as: 'customer', attributes: ['firstName', 'lastName'] }],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    res.json(
      reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        author: r.customer ? `${r.customer.firstName} ${(r.customer.lastName || '').charAt(0)}.`.trim() : 'Customer',
      }))
    );
  } catch (error) {
    console.error('Error getting reviews:', error);
    res.status(500).json({ error: 'Failed to get reviews' });
  }
};
