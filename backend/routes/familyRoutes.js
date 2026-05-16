const express = require('express');
const familyController = require('../controllers/familyController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/create', requireAuth, familyController.createFamily);
router.post('/join', requireAuth, familyController.joinFamily);
router.post('/link-member', requireAuth, familyController.linkMemberByPin);
router.get('/', requireAuth, familyController.getFamily);
router.delete('/leave', requireAuth, familyController.leaveFamily);
router.delete('/members/:userId', requireAuth, familyController.removeMember);

module.exports = router;
