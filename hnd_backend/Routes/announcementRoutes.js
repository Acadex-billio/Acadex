const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const announcementController = require('../controllers/announcementController');
const { requireAuth, requireAdmin } = require('../middlewares/jwtAuth');
const { validate, schemas } = require('../middlewares/validateRequest');

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png'];
  if (allowed.includes(ext)) return cb(null, true);
  return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Invalid file type'));
};

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter,
});

router.use(requireAuth);

router.get('/active', announcementController.listActiveForCandidate);
router.get('/active/count', announcementController.getActiveCountForCandidate);
router.post('/:id/reactions', validate({ params: schemas.ids.mongoIdParam }), announcementController.toggleReaction);
router.get('/:id/attachment', validate({ params: schemas.ids.mongoIdParam }), announcementController.downloadAttachment);

router.post('/', requireAdmin, upload.single('file'), announcementController.create);
router.get('/admin/list', requireAdmin, announcementController.listAdmin);
router.post('/:id/republish', requireAdmin, validate({ params: schemas.ids.mongoIdParam }), announcementController.republish);
router.delete('/:id', requireAdmin, validate({ params: schemas.ids.mongoIdParam }), announcementController.remove);

module.exports = router;
