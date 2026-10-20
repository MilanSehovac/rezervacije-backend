const express = require('express');
const router = express.Router();
const { stats, recentReviews } = require('../controllers/publicController');

router.get('/stats', stats);
router.get('/reviews/recent', recentReviews);

module.exports = router;
