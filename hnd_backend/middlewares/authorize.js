const logger = require('../utils/logger');

const roleRank = {
  candidate: 1,
  lecturer: 2,
  admin: 3,
  developer: 4,
};

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const isAdminRole = (user) => {
  const role = normalizeRole(user?.role);
  return user?.is_admin === true || role === 'admin' || role === 'developer';
};

const isDeveloperRole = (user) => normalizeRole(user?.role) === 'developer';

const hasAnyRole = (user, roles) => {
  const allowedRoles = Array.isArray(roles) ? roles.map(normalizeRole) : [];
  return allowedRoles.includes(normalizeRole(user?.role));
};

const hasMinimumRole = (userRole, minimumRole) => {
  const current = roleRank[normalizeRole(userRole)] || 0;
  const required = roleRank[normalizeRole(minimumRole)] || 0;
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

  if (!hasAnyRole(req.user, roles)) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  return next();
};

module.exports = {
  normalizeRole,
  isAdminRole,
  isDeveloperRole,
  hasAnyRole,
  hasMinimumRole,
  requireRole,
  requireAnyRole,
};
