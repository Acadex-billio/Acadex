const express = require('express');
const router = express.Router();
const multer = require('multer');

const chatController = require('../controllers/chatController');
const { requireAuth } = require('../middlewares/jwtAuth');
const { validate, schemas } = require('../middlewares/validateRequest');
const { requireAnyRole } = require('../middlewares/authorize');

const chatUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		const allowedMime = [
			'application/pdf',
			'image/jpeg',
			'image/png',
			'image/webp',
			'image/gif',
		];
		if (allowedMime.includes(String(file.mimetype || '').toLowerCase())) return cb(null, true);
		return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Unsupported attachment type'));
	},
});

router.use(requireAuth);
router.use(requireAnyRole(['candidate', 'lecturer', 'admin', 'developer', 'superadmin']));

router.post('/bootstrap', chatController.bootstrap);
router.get('/users/search', validate({ query: schemas.chat.querySearch }), chatController.searchUsers);
router.get('/rooms', chatController.listRooms);
router.post('/centers', validate({ body: schemas.chat.createCenter }), chatController.createCenter);
router.post('/invite/:code/join', validate({ params: schemas.ids.codeParam, body: schemas.chat.joinInvite }), chatController.joinByInvite);
router.post('/dm/:otherCandId', validate({ params: schemas.ids.otherCandIdParam }), chatController.getOrCreateDm);
router.get('/dm/:otherCandId/block', validate({ params: schemas.ids.otherCandIdParam }), chatController.getBlockStatus);
router.put('/dm/:otherCandId/block', validate({ params: schemas.ids.otherCandIdParam }), chatController.setBlock);

router.get('/invites', chatController.listMyInvites);
router.post('/invites/:inviteId/respond', validate({ params: schemas.ids.inviteIdParam }), chatController.respondToInvite);
router.post('/rooms/:roomId/invites', validate({ params: schemas.ids.roomIdParam }), chatController.sendCenterInvite);

router.get('/rooms/:roomId/members', validate({ params: schemas.ids.roomIdParam }), chatController.getRoomMembers);
router.get('/rooms/:roomId/messages', validate({ params: schemas.ids.roomIdParam }), chatController.getMessages);
router.get('/rooms/:roomId/messages/:messageId/attachment', validate({ params: schemas.ids.roomIdParam }), chatController.getMessageAttachment);
router.post('/rooms/:roomId/messages', validate({ params: schemas.ids.roomIdParam, body: schemas.chat.sendMessage }), chatUpload.single('attachment'), chatController.sendMessage);
router.post('/rooms/:roomId/messages/:messageId/reactions', validate({ params: schemas.ids.roomIdParam, body: schemas.chat.react }), chatController.addReaction);
router.delete('/rooms/:roomId/messages/:messageId', validate({ params: schemas.ids.roomIdParam }), chatController.deleteMessage);
router.post('/rooms/:roomId/read', validate({ params: schemas.ids.roomIdParam }), chatController.markRead);
router.post('/rooms/:roomId/clear', validate({ params: schemas.ids.roomIdParam }), chatController.clearChat);
router.post('/rooms/:roomId/join', validate({ params: schemas.ids.roomIdParam }), chatController.joinRoom);
router.put('/rooms/:roomId/mute', validate({ params: schemas.ids.roomIdParam, body: schemas.chat.setMute }), chatController.setMute);
router.post('/rooms/:roomId/leave', validate({ params: schemas.ids.roomIdParam }), chatController.leaveRoom);

module.exports = router;
