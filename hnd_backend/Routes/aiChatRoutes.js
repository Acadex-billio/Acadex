const express = require('express');
const router = express.Router();
const { chatStream, health, getProfile, updateProfile } = require('../controllers/aiChatController');
const aiStudyController = require('../controllers/aiStudyController');
const { requireAuth, requireDeveloper } = require('../middlewares/jwtAuth');

/**
 * POST /api/ai/chat
 * Stream-based AI chat endpoint (requires authentication)
 */
router.post('/chat', requireAuth, chatStream);

/**
 * GET /api/ai/profile
 * Get current user's AI memory profile
 */
router.get('/profile', requireAuth, getProfile);

/**
 * PUT /api/ai/profile
 * Update current user's AI memory profile
 */
router.put('/profile', requireAuth, updateProfile);

/**
 * Study Mode - Candidate endpoints
 */
router.get('/study/papers', requireAuth, aiStudyController.listStudyPapersForCandidate);
router.post('/study/session/start', requireAuth, aiStudyController.startStudySession);
router.post('/study/session/answer', requireAuth, aiStudyController.answerStudyQuestion);
router.post('/study/session/submit', requireAuth, aiStudyController.submitStudySession);

/**
 * Study Mode - Developer endpoints
 */
router.get('/study-materials', requireAuth, requireDeveloper, aiStudyController.listStudyMaterialsForDeveloper);
router.post('/study-materials', requireAuth, requireDeveloper, aiStudyController.createStudyMaterial);

/**
 * GET /api/ai/health
 * Check AI service status
 */
router.get('/health', health);

module.exports = router;
