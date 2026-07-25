const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const lecturerController = require('../controllers/lecturerController');
const candidateProjectController = require('../controllers/candidateProjectController');
const { requireAuth } = require('../middlewares/jwtAuth');
const { validateProfileImage, ALLOWED_EXTENSIONS } = require('../middlewares/uploadValidation');
const { validate, schemas } = require('../middlewares/validateRequest');
const { requireAnyRole, requireRole } = require('../middlewares/authorize');

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

const projectUploadStorage = multer.memoryStorage();
const projectUpload = multer({
	storage: projectUploadStorage,
	limits: { fileSize: 20 * 1024 * 1024 },
});

router.get('/public', lecturerController.listPublicLecturers);
router.get('/public/:lecturerId', validate({ params: schemas.ids.lecturerIdParam }), lecturerController.getPublicLecturer);

router.use(requireAuth);

router.get('/me/profile', requireAnyRole(['lecturer']), lecturerController.getMyProfile);
router.put('/me/profile', requireAnyRole(['lecturer']), lecturerController.updateMyProfile);
router.post('/me/profile-picture', requireAnyRole(['lecturer']), uploadProfile.single('profile_picture'), validateProfileImage, lecturerController.uploadMyProfilePicture);
router.post('/me/upload-doc', requireAnyRole(['lecturer']), lecturerController.multerUpload.single('file'), lecturerController.uploadDocument);
router.get('/me/projects/overview', requireAnyRole(['lecturer']), candidateProjectController.getMySubmissionOverview);
router.post('/me/projects/request-permission', requireAnyRole(['lecturer']), candidateProjectController.requestPermission);
router.post('/me/projects/submit', requireAnyRole(['lecturer']), projectUpload.single('file'), candidateProjectController.submitProject);
router.get('/me/dashboard', requireAnyRole(['lecturer']), lecturerController.getMyDashboard);
router.get('/me/bookings', requireAnyRole(['lecturer']), lecturerController.listMyBookings);
router.put('/me/bookings/:bookingId/status', requireAnyRole(['lecturer']), validate({ params: schemas.ids.bookingIdParam, body: schemas.lecturer.updateBookingStatus }), lecturerController.updateMyBookingStatus);
router.get('/me/earnings', requireAnyRole(['lecturer']), lecturerController.getMyEarnings);

router.post('/:lecturerId/bookings', requireAnyRole(['candidate']), validate({ params: schemas.ids.lecturerIdParam, body: schemas.lecturer.createBooking }), lecturerController.createBooking);
router.get('/candidate/bookings', requireAnyRole(['candidate']), lecturerController.listCandidateBookings);
router.post('/bookings/:bookingId/pay', requireAnyRole(['candidate']), validate({ params: schemas.ids.bookingIdParam, body: schemas.lecturer.bookingPayment }), lecturerController.startBookingPayment);
router.get('/bookings/:bookingId/pay/status', requireAnyRole(['candidate']), validate({ params: schemas.ids.bookingIdParam }), lecturerController.refreshBookingPaymentStatus);

router.get('/bookings/:bookingId/messages', validate({ params: schemas.ids.bookingIdParam }), lecturerController.listBookingMessages);
router.post('/bookings/:bookingId/messages', validate({ params: schemas.ids.bookingIdParam, body: schemas.lecturer.message }), lecturerController.sendBookingMessage);
router.post('/bookings/:bookingId/messages/simulate', validate({ params: schemas.ids.bookingIdParam }), lecturerController.simulateBookingConversation);
router.post('/bookings/:bookingId/video/start', requireAnyRole(['lecturer']), validate({ params: schemas.ids.bookingIdParam }), lecturerController.startBookingConference);
router.get('/bookings/:bookingId/video/access', requireAnyRole(['candidate', 'lecturer', 'admin', 'developer', 'superadmin']), validate({ params: schemas.ids.bookingIdParam }), lecturerController.getBookingConferenceAccess);
router.get('/bookings/:bookingId/video/invites/search', validate({ params: schemas.ids.bookingIdParam }), lecturerController.searchConferenceInviteCandidates);
router.post('/bookings/:bookingId/video/invites', validate({ params: schemas.ids.bookingIdParam, body: schemas.lecturer.inviteMany }), lecturerController.inviteConferenceParticipants);
router.post('/bookings/:bookingId/video/invites/respond', requireAnyRole(['candidate']), validate({ params: schemas.ids.bookingIdParam, body: schemas.lecturer.inviteRespond }), lecturerController.respondConferenceInvite);
router.post('/bookings/:bookingId/video/invites/pay', requireAnyRole(['candidate']), validate({ params: schemas.ids.bookingIdParam, body: schemas.lecturer.bookingPayment }), lecturerController.startInviteConferencePayment);
router.get('/bookings/:bookingId/video/invites/pay/status', requireAnyRole(['candidate']), validate({ params: schemas.ids.bookingIdParam }), lecturerController.refreshInviteConferencePayment);

router.get('/admin/pending', requireRole('admin'), lecturerController.listPendingLecturerApprovals);
router.put('/admin/:lecturerId/approval', requireRole('admin'), validate({ params: schemas.ids.lecturerIdParam }), lecturerController.setLecturerApproval);
router.put('/admin/:lecturerId/deactivate', requireRole('admin'), validate({ params: schemas.ids.lecturerIdParam }), lecturerController.deactivateLecturerAccount);
router.put('/admin/:lecturerId/docs/:docType', requireRole('admin'), validate({ params: schemas.ids.lecturerIdParam }), lecturerController.setLecturerDocumentDecision);
router.get('/admin/:lecturerId/doc-stream/:docType', requireRole('admin'), validate({ params: schemas.ids.lecturerIdParam }), lecturerController.streamAdminDoc);
router.post('/admin/:lecturerId/doc-reset/:docType', requireRole('admin'), validate({ params: schemas.ids.lecturerIdParam }), lecturerController.resetAdminDoc);
router.post('/admin/payouts/run', requireRole('admin'), lecturerController.runMonthlyPayout);

module.exports = router;
