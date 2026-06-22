const express = require('express');
const router = express.Router();
const { requireAuth, requireDeveloper } = require('../middlewares/jwtAuth');
const { validate, schemas } = require('../middlewares/validateRequest');
const developerController = require('../controllers/developerController');

router.use(requireAuth);
router.use(requireDeveloper);

// Search users
router.get('/users', validate({ query: schemas.userSearch }), developerController.searchUsers);

// Send broadcast email
router.post('/alerts/email', validate({ body: schemas.developerAlert }), developerController.sendEmailAlert);

// Send broadcast push
router.post('/alerts/push', validate({ body: schemas.developerAlert }), developerController.sendPushAlert);

module.exports = router;
