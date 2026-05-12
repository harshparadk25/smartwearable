const express = require('express');
const healthController = require('../controllers/healthController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, healthController.createHealthData);
router.get('/latest', requireAuth, healthController.getLatestHealthData);

module.exports = router;
