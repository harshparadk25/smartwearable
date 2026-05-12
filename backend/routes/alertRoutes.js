const express = require('express');
const alertController = require('../controllers/alertController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, alertController.getAlerts);

module.exports = router;
