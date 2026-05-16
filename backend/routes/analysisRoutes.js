const express = require('express');
const analysisController = require('../controllers/analysisController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/family', requireAuth, analysisController.getFamilyAnalysis);
router.get('/member/:userId', requireAuth, analysisController.getMemberAnalysis);
router.get('/history/:userId', requireAuth, analysisController.getMemberHistory);

module.exports = router;
