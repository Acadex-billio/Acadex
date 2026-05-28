const express = require('express');
const router = express.Router();
const multer = require('multer');
const adController = require('../controllers/adController');
const { requireAuth, requireDeveloper } = require('../middlewares/jwtAuth');
const { validateProfileImage } = require('../middlewares/uploadValidation');
const { validate, schemas } = require('../middlewares/validateRequest');

const uploadLogo = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 },
});

// All routes require authentication
router.use(requireAuth);

// Public (authenticated) — fetch active ads for current user role
router.get('/active', adController.listActive);

// Track impression / click (any authenticated user)
router.post('/:id/impression', validate({ params: schemas.ids.mongoIdParam }), adController.trackImpression);
router.post('/:id/click', validate({ params: schemas.ids.mongoIdParam }), adController.trackClick);

// Developer-only management routes
router.get('/', requireDeveloper, adController.listAll);
router.post('/upload-logo', requireDeveloper, uploadLogo.single('logo'), validateProfileImage, adController.uploadLogo);
router.post('/', requireDeveloper, adController.create);
router.put('/:id', requireDeveloper, validate({ params: schemas.ids.mongoIdParam }), adController.update);
router.post('/:id/publish', requireDeveloper, validate({ params: schemas.ids.mongoIdParam }), adController.publish);
router.post('/:id/unpublish', requireDeveloper, validate({ params: schemas.ids.mongoIdParam }), adController.unpublish);
router.delete('/:id', requireDeveloper, validate({ params: schemas.ids.mongoIdParam }), adController.remove);

module.exports = router;
