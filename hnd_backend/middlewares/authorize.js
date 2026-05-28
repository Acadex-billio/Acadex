const logger = require('../utils/logger');

const roleRank = {
  candidate: 1,
  lecturer: 2,
  admin: 3,
  developer: 4,
  superadmin: 5,
};

const hasMinimumRole = (userRole, minimumRole) => {
  const current = roleRank[String(userRole || '').toLowerCase()] || 0;
  const required = roleRank[String(minimumRole || '').toLowerCase()] || 0;
  return current >= required;
};

const requireRole = (minimumRole) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });

  if (!hasMinimumRole(req.user.role, minimumRole)) {
    logger.warn('RBAC denied request', {
      requestId: req.requestId,
      userId: req.user?.cand_id,
      role: req.user?.role,
      minimumRole,
      path: req.originalUrl,
      method: req.method,
    });

    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  return next();
};

const requireAnyRole = (roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });

  const normalized = roles.map((r) => String(r).toLowerCase());
  const userRole = String(req.user.role || '').toLowerCase();
  if (!normalized.includes(userRole)) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  return next();
};

module.exports = { requireRole, requireAnyRole };
