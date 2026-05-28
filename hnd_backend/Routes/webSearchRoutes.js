const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/jwtAuth');
const { validate, schemas } = require('../middlewares/validateRequest');

const duckDuckGoController = require('../controllers/duckDuckGoController');

// Require auth on all search endpoints to prevent unauthenticated abuse.
router.get('/health', requireAuth, duckDuckGoController.health);
router.get('/', requireAuth, validate({ query: schemas.chat.querySearch }), duckDuckGoController.search);
router.post('/search', requireAuth, validate({ body: schemas.chat.querySearch }), duckDuckGoController.search);

module.exports = router;
