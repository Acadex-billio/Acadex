const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const { isEnabled } = require('../services/featureFlagService');

const normalizeKeyPart = (value) => String(value || '').trim().toLowerCase();

const resolveClientIp = (req) => {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)[0];
  return forwardedFor || req.ip || req.connection?.remoteAddress || 'unknown';
};

const resolveAccountKey = (req) => {
  const body = req.body || {};
  const query = req.query || {};
  return normalizeKeyPart(
    body.email || body.phone || body.cand_id || body.transactionId || query.email || query.phone || query.transactionId
  ) || 'anon_account';
};

const resolveUserKey = (req) => normalizeKeyPart(req.user?.cand_id || req.user?.id || req.user?._id) || 'anon_user';

const createUserAwareRateLimit = ({
  windowMs,
  max,
  message,
  scope = 'general',
}) => {
  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const ip = resolveClientIp(req);
      const userKey = resolveUserKey(req);
      const accountKey = resolveAccountKey(req);
      return `${scope}:${ip}:${userKey}:${accountKey}`;
    },
    message: {
      success: false,
      message: message || 'Too many requests, please try again later.',
    },
    handler: (req, res) => {
      logger.warn('rate_limit.user_scope.exceeded', {
        scope,
        ip: resolveClientIp(req),
        userKey: resolveUserKey(req),
        accountKey: resolveAccountKey(req),
        path: req.originalUrl,
        method: req.method,
      });
      res.status(429).json({
        success: false,
        message: message || 'Too many requests, please try again later.',
      });
    },
  });

  return (req, res, next) => {
    if (!isEnabled('FEATURE_USER_RATE_LIMIT_ENABLED', false)) {
      return next();
    }
    return limiter(req, res, next);
  };
};

const userAuthRateLimit = createUserAwareRateLimit({
  scope: 'auth',
  windowMs: 15 * 60 * 1000,
  max: 12,
  message: 'Too many authentication attempts, please try again later.',
});

const userPasswordResetRateLimit = createUserAwareRateLimit({
  scope: 'password_reset',
  windowMs: 60 * 60 * 1000,
  max: 6,
  message: 'Too many password reset attempts, please try again later.',
});

const userPaymentInitiationRateLimit = createUserAwareRateLimit({
  scope: 'payment_initiation',
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many payment initiation attempts, please try again shortly.',
});

const userPaymentStatusRateLimit = createUserAwareRateLimit({
  scope: 'payment_status',
  windowMs: 15 * 60 * 1000,
  max: 90,
  message: 'Too many payment status requests, please wait and retry.',
});

module.exports = {
  createUserAwareRateLimit,
  userAuthRateLimit,
  userPasswordResetRateLimit,
  userPaymentInitiationRateLimit,
  userPaymentStatusRateLimit,
};
