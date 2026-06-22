const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const dashboardController = require('../controllers/dashboardController');
const profileController = require('../controllers/profileController');
const reportController = require('../controllers/reportController');
const presentationController = require('../controllers/presentationController');
const historyController = require('../controllers/historyController');
const candidateAnalyticsController = require('../controllers/candidateAnalyticsController');
const candidateQuestionPaperController = require('../controllers/candidateQuestionPaperController');
const downloadsController = require('../controllers/downloadsController');
const candidateAccountController = require('../controllers/candidateAccountController');
const { checkMaterialAccess, getMaterialAccessInfo } = require('../middlewares/materialAccessMiddleware');
const subscriptionController = require('../controllers/subscriptionController');
const internshipTopicController = require('../controllers/internshipTopicController');
const { validateProfileImage, ALLOWED_EXTENSIONS } = require('../middlewares/uploadValidation');
const { requireAuth, requireSelfOrAdmin } = require('../middlewares/jwtAuth');
const { validate, schemas } = require('../middlewares/validateRequest');
const { requireAnyRole } = require('../middlewares/authorize');

const profileStorage = multer.memoryStorage();
const profileImageFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.images.includes(ext)) return cb(null, true);
  return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Invalid file type'));
};

const uploadProfile = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: profileImageFilter,
});

router.use(requireAuth);
router.use(requireAnyRole(['candidate', 'admin', 'developer', 'superadmin']));

router.get('/dashboard', dashboardController.getDashboard);

router.get('/profile/:cand_id', requireSelfOrAdmin('cand_id'), profileController.getProfile);
router.put('/profile/update/:cand_id', requireSelfOrAdmin('cand_id'), profileController.updateProfile);
router.put('/profile/update-password/:cand_id', requireSelfOrAdmin('cand_id'), profileController.updatePassword);
router.put('/profile/settings/:cand_id', requireSelfOrAdmin('cand_id'), profileController.updateSettings);
router.put('/profile/push-subscription/:cand_id', requireSelfOrAdmin('cand_id'), profileController.updatePushSubscription);
router.delete('/profile/push-subscription/:cand_id', requireSelfOrAdmin('cand_id'), profileController.deletePushSubscription);
router.get('/profile-picture/:cand_id', requireSelfOrAdmin('cand_id'), profileController.serveProfilePicture);

router.post(
  '/profile/upload-picture/:cand_id',
  requireSelfOrAdmin('cand_id'),
  uploadProfile.single('profile_picture'),
  validateProfileImage,
  profileController.uploadPicture
);

router.get('/reports', reportController.getAll);
router.get('/reports/file/:filename', checkMaterialAccess('report', 'download'), reportController.downloadFile);
router.get('/reports/preview/:filename', checkMaterialAccess('report', 'preview'), reportController.previewFile);

router.get('/presentations', presentationController.getAll);
router.get('/presentations/file/:filename', checkMaterialAccess('presentation', 'download'), presentationController.downloadFile);
router.get('/presentations/preview/:filename', checkMaterialAccess('presentation', 'preview'), presentationController.previewFile);

// Save (in-app) endpoints for reports and presentations
router.post('/reports/save', downloadsController.saveDownload);
router.post('/presentations/save', downloadsController.saveDownload);

router.get('/departments', candidateQuestionPaperController.getDepartments);
router.get('/question-papers', candidateQuestionPaperController.getQuestionPapers);
router.get('/question-papers/file/:filename', checkMaterialAccess('questionPaper', 'download'), candidateQuestionPaperController.downloadPaper);
router.get('/question-papers/preview/:filename', checkMaterialAccess('questionPaper', 'preview'), candidateQuestionPaperController.previewPaper);

// Downloads (in-app saves) - save and list user downloads, and stream saved files
router.post('/downloads/save', downloadsController.saveDownload);
router.get('/downloads', downloadsController.listDownloads);
router.get('/downloads/:downloadId/file', checkMaterialAccess('savedDownload'), downloadsController.streamSavedDownload);
router.delete('/downloads/:downloadId', downloadsController.deleteDownload);

router.get('/analytics/materials/summary', candidateAnalyticsController.getMyMaterialSummary);
router.get('/analytics/materials/activity', candidateAnalyticsController.getMyMaterialActivity);
router.get('/analytics/chat/stats', candidateAnalyticsController.getMyChatStats);

router.get('/subscription/catalog', subscriptionController.getCatalog);
router.get('/subscription/me', subscriptionController.getMySubscription);
router.post('/subscription/checkout', validate({ body: schemas.candidate.subscriptionCheckout }), subscriptionController.startPlanCheckout);
router.post('/subscription/manual-checkout', validate({ body: schemas.candidate.manualSubscriptionCheckout }), subscriptionController.startManualPlanCheckout);

router.get('/internship-topics', internshipTopicController.listCandidateTopics);
router.get('/internship-topics/:topicId', validate({ params: schemas.ids.topicIdParam }), internshipTopicController.getCandidateTopicDetail);
router.post('/internship-topics/:topicId/rating', validate({ params: schemas.ids.topicIdParam }), internshipTopicController.rateTopic);
router.post('/internship-topics/:topicId/recommend', validate({ params: schemas.ids.topicIdParam }), internshipTopicController.toggleRecommendation);
router.post('/internship-topics/:topicId/reaction', validate({ params: schemas.ids.topicIdParam }), internshipTopicController.setReaction);

router.post('/payments/materials/checkout', validate({ body: schemas.candidate.materialCheckout }), subscriptionController.startMaterialCheckout);
router.post('/payments/centers/checkout', validate({ body: schemas.candidate.centerCheckout }), subscriptionController.startCenterCheckout);
router.get('/payments/:transactionId/status', validate({ params: schemas.ids.transactionIdParam }), subscriptionController.getPaymentStatus);

router.post('/history/add', historyController.add);
router.get('/history/:user_id', requireSelfOrAdmin('user_id'), historyController.getByUser);

router.get('/account/status', candidateAccountController.getAccountStatus);
router.post('/account/complaint', candidateAccountController.submitComplaint);
router.delete('/account/delete', candidateAccountController.deleteMyAccount);

router.get('/account/left-groups', candidateAccountController.listLeftGroups);
router.post('/account/left-groups/:roomId/rejoin', validate({ params: schemas.ids.roomIdParam }), candidateAccountController.rejoinGroup);
router.get('/account/blocked-users', candidateAccountController.listBlockedUsers);
router.delete('/account/blocked-users/:otherCandId', validate({ params: schemas.ids.otherCandIdParam }), candidateAccountController.unblockUser);

module.exports = router;
