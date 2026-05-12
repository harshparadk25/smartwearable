const express = require('express');
const connectionController = require('../controllers/connectionController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, connectionController.createConnectionEvent);
router.get('/', requireAuth, connectionController.getConnections);

module.exports = router;
