const express = require('express');
const deviceController = require('../controllers/deviceController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// BLE bridge calls this without a JWT when it has no token yet — auth is optional
// (userId must then be in the request body)
router.post('/register', (req, res, next) => {
  const header = req.headers.authorization || '';
  const hasToken = header.startsWith('Bearer ');
  if (hasToken) {
    return requireAuth(req, res, () => deviceController.registerDevice(req, res, next));
  }
  // Unauthenticated: proceed but userId must be supplied in body
  return deviceController.registerDevice(req, res, next);
});

router.get('/', requireAuth, deviceController.getDevices);
router.patch('/:pin/disconnect', requireAuth, deviceController.markDisconnected);

module.exports = router;
