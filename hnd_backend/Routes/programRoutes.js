const express = require('express');
const router = express.Router();
const { requireAuth, requireDeveloper } = require('../middlewares/jwtAuth');
const programController = require('../controllers/programController');

router.get('/', programController.listActive);

router.use(requireAuth, requireDeveloper);
router.get('/manage', programController.listManaged);
router.post('/', programController.create);
router.put('/:code', programController.update);
router.patch('/:code/activate', programController.activate);
router.delete('/:code', programController.deactivate);

module.exports = router;