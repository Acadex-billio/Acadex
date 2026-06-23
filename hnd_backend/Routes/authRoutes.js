const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const departmentController = require('../controllers/departmentController');
const { requireAuth } = require('../middlewares/jwtAuth');
const { validate, schemas } = require('../middlewares/validateRequest');
const { 
  validateRequiredFields, 
  validateEmailInput, 
  validatePasswordInput,
  authRateLimit,
  passwordResetRateLimit
} = require('../middlewares/inputValidation');
const {
  userAuthRateLimit,
  userPasswordResetRateLimit,
} = require('../middlewares/userRateLimit');

router.post('/register', 
  authRateLimit,
  userAuthRateLimit,
  validate({ body: schemas.auth.register }),
  validateRequiredFields(['name', 'email', 'phone', 'password']),
  validateEmailInput,
  validatePasswordInput,
  authController.register
);

router.post('/login', 
  authRateLimit,
  userAuthRateLimit,
  validate({ body: schemas.auth.login }),
  validateRequiredFields(['email', 'password']),
  validateEmailInput,
  authController.login
);

router.get('/departments', departmentController.getAllFormatted);
router.get('/me', requireAuth, authController.me);
router.post('/logout', authController.logout);

router.post('/reset-password', 
  passwordResetRateLimit,
  userPasswordResetRateLimit,
  validateRequiredFields(['email']),
  validateEmailInput,
  authController.resetPasswordRequest
);

router.post('/update-password', 
  passwordResetRateLimit,
  userPasswordResetRateLimit,
  validateRequiredFields(['email', 'code', 'newPassword']),
  validateEmailInput,
  validatePasswordInput,
  authController.updatePassword
);

module.exports = router;
