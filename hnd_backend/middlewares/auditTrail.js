const logger = require('../utils/logger');
const { isEnabled } = require('../services/featureFlagService');

const maskEmail = (value) => {
  const raw = String(value || '').trim();
  if (!raw.includes('@')) return raw;
  const [name, domain] = raw.split('@');
  if (!name) return `***@${domain || ''}`;
  return `${name.slice(0, 2)}***@${domain || ''}`;
};

const maskPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return `***${digits}`;
  return `***${digits.slice(-4)}`;
};

const normalizeAuditValue = (key, value) => {
  const normalizedKey = String(key || '').toLowerCase();
  if (normalizedKey.includes('password') || normalizedKey.includes('token') || normalizedKey.includes('secret')) {
    return '[REDACTED]';
  }
  if (normalizedKey.includes('email')) return maskEmail(value);
  if (normalizedKey.includes('phone')) return maskPhone(value);
  return value;
};

const pickFields = (source, fields) => {
  if (!source || !Array.isArray(fields) || fields.length === 0) return undefined;
  const result = {};
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] != null) {
      result[field] = normalizeAuditValue(field, source[field]);
    }
  });
  return Object.keys(result).length ? result : undefined;
};

const createAuditTrail = (eventName, options = {}) => {
  const {
    bodyFields = [],
    paramFields = [],
    queryFields = [],
  } = options;

  return (req, res, next) => {
    if (!isEnabled('FEATURE_AUDIT_LOGGING_ENABLED', false)) return next();

    const startedAt = Date.now();
    const requestMeta = {
      request_id: req.requestId,
      event: eventName,
      method: req.method,
      path: req.originalUrl,
      actor_cand_id: req.user?.cand_id || null,
      ip: req.ip,
      body: pickFields(req.body, bodyFields),
      params: pickFields(req.params, paramFields),
      query: pickFields(req.query, queryFields),
    };

    logger.info('audit.request', requestMeta);

    res.on('finish', () => {
      logger.info('audit.response', {
        request_id: req.requestId,
        event: eventName,
        method: req.method,
        path: req.originalUrl,
        status_code: res.statusCode,
        duration_ms: Date.now() - startedAt,
      });
    });

    next();
  };
};

module.exports = {
  createAuditTrail,
};
