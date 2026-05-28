const express = require('express');
const router = express.Router();

const aiToolsController = require('../controllers/aiToolsController');
const { requireAuth, requireAdmin } = require('../middlewares/jwtAuth');

// Enforce JWT auth + admin role for ai-tools routes
router.use(requireAuth);
router.use(requireAdmin);

router.get('/summary', aiToolsController.getSummary);
router.get('/recent-registrations', aiToolsController.getRecentRegistrations);
router.get('/departments/stats', aiToolsController.getDepartmentStats);
router.get('/chat/activity', aiToolsController.getChatroomActivity);
router.get('/materials/activity', aiToolsController.getMaterialActivity);
router.get('/history', aiToolsController.getPlatformHistory);
router.get('/materials/recent', aiToolsController.getRecentMaterials);
router.get('/accounts/status-stats', aiToolsController.getAccountStatusStats);
router.get('/announcements/recent', aiToolsController.getRecentAnnouncements);

module.exports = router;
