const crypto = require('crypto');
const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const startedAt = Date.now();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    logger.info('HTTP request completed', {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userAgent: req.get('User-Agent') || null,
      userId: req.user?.cand_id || null,
    });
  });

  next();
};

module.exports = { requestLogger };
