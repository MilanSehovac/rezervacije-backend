const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { list, markRead, markAllRead } = require('../controllers/notificationController');

router.use(authenticate);
router.get('/', list);
router.post('/read-all', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
