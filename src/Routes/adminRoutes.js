const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/admin');
const { listSalons, setApproval } = require('../controllers/adminController');

router.use(authenticate, adminOnly);
router.get('/salons', listSalons);
router.patch('/salons/:id', setApproval);

module.exports = router;
