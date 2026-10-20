const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { list, ids, add, remove } = require('../controllers/favoriteController');

router.use(authenticate);
router.get('/', list);
router.get('/ids', ids);
router.put('/:salonId', add);
router.delete('/:salonId', remove);

module.exports = router;
