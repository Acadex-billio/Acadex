const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const departmentController = require('../controllers/departmentController');
const questionPaperController = require('../controllers/questionPaperController');
const adminReportController = require('../controllers/adminReportController');
const adminPresentationController = require('../controllers/adminPresentationController');
const adminCandidateController = require('../controllers/adminCandidateController');
const candidateProjectController = require('../controllers/candidateProjectController');
const platformPricingController = require('../controllers/platformPricingController');
const internshipTopicController = require('../controllers/internshipTopicController');
const couponController = require('../controllers/couponController');
const adminBillingController = require('../controllers/adminBillingController');
const { validateDocumentUpload } = require('../middlewares/uploadValidation');
const { requireAuth, requireAdmin, requireDeveloper, requireSuperAdmin } = require('../middlewares/jwtAuth');
const { validate, schemas } = require('../middlewares/validateRequest');

// Enforce JWT auth first, then role checks
router.use(requireAuth);
router.use(requireAdmin);

const storage = multer.memoryStorage();

const reportFileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = ['.pdf', '.doc', '.docx'];
  if (allowed.includes(ext)) return cb(null, true);
  return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Invalid report file type'));
};

const presentationFileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = ['.ppt', '.pptx'];
  if (allowed.includes(ext)) return cb(null, true);
  return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Invalid presentation file type'));
};

const questionPaperFileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = ['.pdf'];
  if (allowed.includes(ext)) return cb(null, true);
  return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Invalid file type'));
};

const uploadPaper = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: questionPaperFileFilter,
});
const uploadReport = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: reportFileFilter,
});
const uploadPresentation = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: presentationFileFilter,
});

router.get('/departments', departmentController.getAllFormatted);
router.get('/departments/overview', departmentController.getOverview);
router.get('/departments/trends', departmentController.getTopDepartmentTrends);
router.post('/departments', departmentController.create);
router.put('/departments/:id', validate({ params: schemas.ids.mongoIdParam }), departmentController.update);
router.delete('/departments/:id', validate({ params: schemas.ids.mongoIdParam }), departmentController.remove);

router.get('/get-question-papers', questionPaperController.getQuestionPapers);
router.put('/question-papers/:id', validate({ params: schemas.ids.mongoIdParam }), questionPaperController.updatePaper);
router.delete('/question-papers/:id', validate({ params: schemas.ids.mongoIdParam }), questionPaperController.deletePaper);
router.get('/complaints', adminCandidateController.listComplaints);
router.post(
  '/upload-paper',
  uploadPaper.single('paperFile'),
  validateDocumentUpload,
  questionPaperController.uploadPaper
);
router.get('/download-paper/:filename', questionPaperController.downloadPaper);

router.get('/reports/list', adminReportController.listReports);
router.post(
  '/upload-report',
  uploadReport.single('reportDoc'),
  validateDocumentUpload,
  adminReportController.uploadReport
);
router.put('/reports/:id', validate({ params: schemas.ids.mongoIdParam }), adminReportController.updateReport);
router.delete('/reports/:id', validate({ params: schemas.ids.mongoIdParam }), adminReportController.deleteReport);

router.get('/reports', adminPresentationController.getReports);
router.get('/presentations/list', adminPresentationController.listPresentations);
router.post(
  '/upload-presentation',
  uploadPresentation.single('presentationFile'),
  validateDocumentUpload,
  adminPresentationController.uploadPresentation
);
router.put('/presentations/:id', validate({ params: schemas.ids.mongoIdParam }), adminPresentationController.updatePresentation);
router.delete('/presentations/:id', validate({ params: schemas.ids.mongoIdParam }), adminPresentationController.deletePresentation);

router.get('/candidates', adminCandidateController.listCandidates);
router.get('/candidates/:candId', validate({ params: schemas.ids.candIdParam }), adminCandidateController.getCandidateDetails);
router.put('/candidates/:candId/suspend', validate({ params: schemas.ids.candIdParam }), adminCandidateController.suspendCandidate);
router.put('/candidates/:candId/block', validate({ params: schemas.ids.candIdParam }), adminCandidateController.blockCandidate);
router.put('/candidates/:candId/reactivate', validate({ params: schemas.ids.candIdParam }), adminCandidateController.reactivateCandidate);
router.put('/candidates/:candId/complaints/reviewed', validate({ params: schemas.ids.candIdParam }), adminCandidateController.markComplaintsReviewed);

router.get('/project-submissions', requireDeveloper, candidateProjectController.listForDeveloper);
router.put('/project-submissions/:id', requireDeveloper, candidateProjectController.updateSubmission);
router.get('/project-submissions/pricing', requireDeveloper, candidateProjectController.listPricingForDeveloper);
router.put('/project-submissions/pricing', requireDeveloper, candidateProjectController.updatePricing);

router.get('/pricing', requireDeveloper, platformPricingController.getPricing);
router.put('/pricing', requireDeveloper, platformPricingController.updatePricing);
router.post('/pricing/publish', requireDeveloper, platformPricingController.publishPricing);

router.get('/internship-topics', internshipTopicController.listAdminTopics);
router.post('/internship-topics', internshipTopicController.createTopic);
router.put('/internship-topics/:topicId', validate({ params: schemas.ids.topicIdParam }), internshipTopicController.updateTopic);
router.delete('/internship-topics/:topicId', validate({ params: schemas.ids.topicIdParam }), internshipTopicController.deleteTopic);

// Superadmin routes
router.get('/users', adminCandidateController.listAllUsers);
router.put('/users/:candId/role', requireDeveloper, validate({ params: schemas.ids.candIdParam }), adminCandidateController.updateUserRole);
router.put('/users/:candId/program', validate({ params: schemas.ids.candIdParam }), adminCandidateController.updateUserProgram);
router.post('/users/program-update-campaign', adminCandidateController.startProgramUpdateCampaign);
router.put('/candidates/:candId/program', validate({ params: schemas.ids.candIdParam }), adminCandidateController.updateUserProgram);
router.post('/candidates/program-update-campaign', adminCandidateController.startProgramUpdateCampaign);
router.put('/users/:candId/suspend', requireSuperAdmin, validate({ params: schemas.ids.candIdParam }), adminCandidateController.suspendUser);
router.put('/users/:candId/block', requireSuperAdmin, validate({ params: schemas.ids.candIdParam }), adminCandidateController.blockUser);
router.put('/users/:candId/reactivate', requireSuperAdmin, validate({ params: schemas.ids.candIdParam }), adminCandidateController.reactivateUser);

// Billing / subscription management (developer only)
router.get('/billing/subscriptions', requireDeveloper, adminCandidateController.listSubscriptions);
router.put('/billing/subscriptions/:candId', requireDeveloper, validate({ params: schemas.ids.candIdParam }), adminCandidateController.updateSubscription);
router.delete('/billing/subscriptions/:candId', requireDeveloper, validate({ params: schemas.ids.candIdParam }), adminCandidateController.cancelSubscription);
router.get('/billing/manual-payments', requireDeveloper, adminCandidateController.listManualPaymentVerifications);
router.post('/billing/manual-payments/:transactionId/approve', requireDeveloper, validate({ params: schemas.ids.transactionIdParam, body: schemas.admin.manualPaymentApprove }), adminCandidateController.approveManualPaymentVerification);
router.post('/billing/manual-payments/:transactionId/reject', requireDeveloper, validate({ params: schemas.ids.transactionIdParam, body: schemas.admin.manualPaymentReject }), adminCandidateController.rejectManualPaymentVerification);
router.post('/billing/transactions/:transactionId/repair', requireDeveloper, validate({ params: schemas.ids.transactionIdParam, body: schemas.admin.repairTransaction }), adminBillingController.repairTransaction);
router.get('/billing/reconciliation/status', requireDeveloper, adminBillingController.getReconciliationStatus);
router.post('/billing/reconciliation/run', requireDeveloper, adminBillingController.runReconciliationNow);
router.get('/billing/coupons', requireDeveloper, couponController.listCoupons);
router.post('/billing/coupons', requireDeveloper, couponController.createCoupon);
router.put('/billing/coupons/:code', requireDeveloper, validate({ params: schemas.ids.codeParam }), couponController.updateCoupon);
router.post('/billing/coupons/:code/publish', requireDeveloper, validate({ params: schemas.ids.codeParam }), couponController.publishCoupon);
router.post('/billing/coupons/:code/unpublish', requireDeveloper, validate({ params: schemas.ids.codeParam }), couponController.unpublishCoupon);
router.delete('/billing/coupons/:code', requireDeveloper, validate({ params: schemas.ids.codeParam }), couponController.deleteCoupon);

module.exports = router;
