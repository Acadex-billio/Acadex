/**
 * JWT Authentication Middleware
 * Replaces session-based authentication with JWT tokens
 */

const User = require('../models/User');
const { jwtAuthMiddleware, isAdmin, isSelfOrAdmin } = require('../utils/jwtUtils');
const logger = require('../utils/logger');

const authDebugEnabled = String(process.env.AUTH_DEBUG || '').trim().toLowerCase() === 'true';
const logAuthDebug = (...args) => {
  if (authDebugEnabled) logger.debug(args.map((x) => String(x)).join(' '));
};

const normalizeRoutePart = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const noTrailing = raw.replace(/\/+$/, '');
  return noTrailing || '/';
};

const isPendingLecturerDeniedRoute = (req) => {
  const baseUrl = normalizeRoutePart(req.baseUrl);
  const path = normalizeRoutePart(req.path);

  if (baseUrl === '/api/chat') {
    return true;
  }

  if (baseUrl === '/api/lecturers') {
    if (/^\/me\/bookings(?:\/|$)/.test(path)) return true;
    if (/^\/bookings(?:\/|$)/.test(path)) return true;
    if (/^\/[^/]+\/bookings(?:\/|$)/.test(path)) return true;
  }

  return false;
};

const isAllowlistedWhenRestricted = (req, accountStatus, role) => {
  const path = normalizeRoutePart(req.path);
  const baseUrl = normalizeRoutePart(req.baseUrl);
  const method = String(req.method || 'GET').toUpperCase();
  if (path === '/account/status') return true;
  if (path === '/account/complaint' && method === 'POST') return true;
  if (path === '/account/delete' && method === 'DELETE') return true;

  const normalizedRole = String(role || '').toLowerCase();
  const normalizedStatus = String(accountStatus || '').toLowerCase();
  const isPendingLecturer = normalizedRole === 'lecturer' && normalizedStatus === 'pending_approval';
  if (isPendingLecturer) {
    return !isPendingLecturerDeniedRoute(req);
  }

  return false;
};

const requireAuth = async (req, res, next) => {
  try {
    const origin = req.get('origin') || 'No-Origin';

    // Bypass auth for testing (NOTE: Remove in production)
    if (req.bypassAuth) {
      logAuthDebug('[JWT Auth] Bypassed for testing');
      return next();
    }

    // Use JWT authentication
    try {
      req.user = await jwtAuthMiddleware(req);
      // If we reach here, authentication succeeded
      await processAuthenticatedRequest(req, res, next, origin);
    } catch (err) {
      logger.warn('JWT authentication failed', { requestId: req.requestId, error: err.message, path: req.originalUrl });
      return res.status(401).json({
        success: false,
        message: err.message || 'Authentication failed'
      });
    }
  } catch (err) {
    logger.error('JWT authentication unexpected error', { requestId: req.requestId, error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

// Async handler for post-authentication processing
const processAuthenticatedRequest = async (req, res, next, origin) => {
  try {
    // User is authenticated, now check additional requirements
    if (!req.user) {
      logger.error('JWT auth missing user data', { requestId: req.requestId });
      return res.status(401).json({
        success: false,
        message: 'Authentication failed - No user data'
      });
    }

    const candId = String(req.user.cand_id || '').trim();
    if (!candId) {
      logger.error('JWT auth missing cand_id', {
        requestId: req.requestId,
        origin
      });
      return res.status(401).json({
        success: false,
        message: 'Authentication failed - No candidate ID'
      });
    }
    logAuthDebug('[JWT Auth] Validating user for path:', req.path);

    // Validate user exists in database - using await instead of .then()
    const u = await User.findOne({ cand_id: candId })
      .select('cand_id account_status suspension block')
      .lean();

    if (!u) {
      logger.error('JWT auth user not found in database', {
        requestId: req.requestId,
        path: req.path,
        origin
      });
      return res.status(401).json({
        success: false,
        message: 'Authentication failed - User not found'
      });
    }

    const normalizedRole = String(req.user.role || '').toLowerCase();
    const canAutoReactivate = normalizedRole === 'candidate';

    // Auto-reactivate only candidate accounts after suspension expires.
    if (canAutoReactivate && u.account_status === 'suspended' && u.suspension?.end_at && new Date(u.suspension.end_at) <= new Date()) {
      try {
        await User.updateOne(
          { cand_id: candId },
          {
            $set: { account_status: 'active', suspension: { start_at: null, end_at: null, reason: null, set_by: null, set_at: null } },
          }
        );
        req.user.account_status = 'active';
        logAuthDebug('[JWT Auth] Candidate auto-reactivated after suspension expiry');
        return next();
      } catch (err) {
        logger.error('JWT auto-reactivation failed', { requestId: req.requestId, error: err.message, stack: err.stack });
        return res.status(500).json({ success: false, message: 'Account status update failed' });
      }
    } else if (u.account_status === 'active') {
      req.user.account_status = 'active';
      return next();
    } else {
      // CRITICAL: Enforce account_status restrictions for ALL users, including admins
      if (isAllowlistedWhenRestricted(req, u.account_status, req.user.role)) return next();

      const payload = {
        success: false,
        restricted: true,
        account_status: u.account_status,
        suspension: u.suspension || null,
        block: u.block || null,
        message:
          u.account_status === 'blocked'
            ? 'Account blocked'
            : u.account_status === 'pending_approval'
              ? 'Account pending approval'
              : 'Account suspended',
      };
      return res.status(403).json(payload);
    }
  } catch (err) {
    logger.error('JWT auth database operation error', { requestId: req.requestId, error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Authentication check failed' });
  }
};

const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // Check admin role from JWT
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }

  // CRITICAL FIX: Verify admin account is active (not suspended/blocked)
  try {
    const adminUser = await User.findOne({ cand_id: req.user.cand_id })
      .select('account_status suspension block')
      .lean();
    
    if (!adminUser) {
      logger.error('Admin auth user not found', { requestId: req.requestId, candId: req.user?.cand_id });
      return res.status(401).json({ success: false, message: 'Admin not found' });
    }
    
    if (adminUser.account_status !== 'active') {
      logger.warn('Admin access blocked account not active', {
        requestId: req.requestId,
        account_status: adminUser.account_status
      });
      return res.status(403).json({
        success: false,
        message: 'Admin account is ' + adminUser.account_status,
        restricted: true,
        account_status: adminUser.account_status
      });
    }
  } catch (err) {
    logger.error('Admin auth database lookup failed', { requestId: req.requestId, error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Admin verification failed' });
  }

  next();
};

const requireDeveloper = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const role = String(req.user.role || '').toLowerCase();
  if (role !== 'developer' && role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Developer access required' });
  }

  try {
    const developerUser = await User.findOne({ cand_id: req.user.cand_id })
      .select('account_status')
      .lean();

    if (!developerUser || developerUser.account_status !== 'active') {
      return res.status(403).json({ success: false, message: 'Developer account not active' });
    }
  } catch (err) {
    logger.error('Developer auth database lookup failed', { requestId: req.requestId, error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Developer verification failed' });
  }

  next();
};

const requireSelfOrAdmin = (paramName = 'cand_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const candId = req.params?.[paramName];
    if (candId && String(candId) === String(req.user.cand_id)) return next();

    if (isAdmin(req)) return next();

    return res.status(403).json({ success: false, message: 'Forbidden' });
  };
};

const requireSuperAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // Check superadmin role from JWT
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Superadmin access required' });
  }

  // Verify superadmin account is active
  try {
    const superUser = await User.findOne({ cand_id: req.user.cand_id })
      .select('account_status')
      .lean();
    
    if (!superUser || superUser.account_status !== 'active') {
      return res.status(403).json({ success: false, message: 'Superadmin account not active' });
    }
  } catch (err) {
    console.error('[SuperAdmin Auth] Database lookup failed:', err);
    return res.status(500).json({ success: false, message: 'Superadmin verification failed' });
  }

  next();
};

module.exports = { requireAuth, requireAdmin, requireDeveloper, requireSuperAdmin, requireSelfOrAdmin };
