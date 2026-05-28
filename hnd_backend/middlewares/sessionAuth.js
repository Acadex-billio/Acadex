const User = require('../models/User');

const isAllowlistedWhenRestricted = (req) => {
  const path = String(req.path || '');
  const method = String(req.method || 'GET').toUpperCase();
  if (path === '/account/status') return true;
  if (path === '/account/complaint' && method === 'POST') return true;
  if (path === '/account/delete' && method === 'DELETE') return true;
  if (path.startsWith('/api/web-search/health')) return true; // Allow web search health check
  if (path.startsWith('/api/web-search/search')) return true; // Allow web search
  return false;
};

const requireAuth = async (req, res, next) => {
  try {
    // Enhanced debugging for cross-origin authentication
    const userAgent = req.get('User-Agent') || 'Unknown';
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const origin = req.get('origin') || 'No-Origin';
    const referer = req.get('referer') || 'No-Referer';
    
    // Mobile-specific logging
    if (isMobileDevice) {
      console.log('[Mobile Auth] Mobile device detected:', {
        userAgent: userAgent,
        origin: origin,
        path: req.path,
        sessionId: req.sessionID
      });
    }
    
    console.log('[Cross-Origin Auth] Request:', {
      path: req.path,
      method: req.method,
      origin: origin,
      referer: referer,
      hasSession: !!req.session,
      hasUser: !!(req.session && req.session.user),
      sessionId: req.sessionID,
      isMobile: isMobileDevice,
      userAgent: userAgent.substring(0, 50),
      cookieHeader: req.get('cookie') ? 'Present' : 'Missing',
      sessionCookie: req.session?.cookie ? {
        sameSite: req.session.cookie.sameSite,
        secure: req.session.cookie.secure,
        httpOnly: req.session.cookie.httpOnly,
        domain: req.session.cookie.domain,
        maxAge: req.session.cookie.maxAge
      } : 'No cookie'
    });
    
    // Bypass auth for testing
    if (req.bypassAuth) {
      console.log('[Cross-Origin Auth] Bypassed for testing');
      return next();
    }
    
    if (!req.session) {
      console.error('[Cross-Origin Auth] ERROR: No session object found', {
        path: req.path,
        origin: origin,
        cookieHeader: req.get('cookie') ? 'Present' : 'Missing',
        sessionId: req.sessionID,
        headers: {
          'user-agent': userAgent,
          'origin': origin,
          'referer': referer,
          'cookie': req.get('cookie') || 'Missing'
        }
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Not authenticated - No session',
        debug: {
          hasSession: false,
          sessionId: req.sessionID,
          origin: origin
        }
      });
    }
    
    if (!req.session.user) {
      console.error('[Cross-Origin Auth] ERROR: Session exists but no user data', {
        path: req.path,
        sessionId: req.sessionID,
        sessionData: Object.keys(req.session),
        origin: origin,
        cookieHeader: req.get('cookie') ? 'Present' : 'Missing'
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Not authenticated - No user in session',
        debug: {
          hasSession: true,
          hasUser: false,
          sessionId: req.sessionID,
          sessionKeys: Object.keys(req.session)
        }
      });
    }

    const role = String(req.session.user.role || '').toLowerCase();
    const isAdmin = role === 'admin' || req.session.user.is_admin === true;
    if (isAdmin) return next();

    const candId = String(req.session.user.cand_id || '').trim();
    if (!candId) {
      console.error('[Cross-Origin Auth] ERROR: No cand_id in session user', {
        path: req.path,
        sessionId: req.sessionID,
        userData: req.session.user,
        origin: origin
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Not authenticated - No candidate ID',
        debug: {
          hasSession: true,
          hasUser: true,
          hasCandId: false,
          userData: req.session.user
        }
      });
    }

    console.log('[Cross-Origin Auth] Validating user:', {
      candId: candId,
      sessionId: req.sessionID,
      path: req.path
    });

    const u = await User.findOne({ cand_id: candId })
      .select('cand_id account_status suspension block')
      .lean();
    
    if (!u) {
      console.error('[Cross-Origin Auth] ERROR: User not found in database', {
        candId: candId,
        sessionId: req.sessionID,
        path: req.path,
        origin: origin
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Not authenticated - User not found',
        debug: {
          candId: candId,
          sessionId: req.sessionID
        }
      });
    }

    // Auto-reactivate if suspension expired
    if (u.account_status === 'suspended' && u.suspension?.end_at && new Date(u.suspension.end_at) <= new Date()) {
      await User.updateOne(
        { cand_id: candId },
        {
          $set: { account_status: 'active', suspension: { start_at: null, end_at: null, reason: null, set_by: null, set_at: null } },
        }
      );
      req.session.user.account_status = 'active';
      return next();
    }

    if (u.account_status === 'active') {
      req.session.user.account_status = 'active';
      return next();
    }

    if (isAllowlistedWhenRestricted(req)) return next();

    const payload = {
      success: false,
      restricted: true,
      account_status: u.account_status,
      suspension: u.suspension || null,
      block: u.block || null,
      message: u.account_status === 'blocked' ? 'Account blocked' : 'Account suspended',
    };
    return res.status(403).json(payload);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Auth check failed' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  if (String(req.session.user.role || '').toLowerCase() === 'admin') return next();
  if (req.session.user.is_admin === true) return next();

  const adminEmails = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const email = String(req.session.user.email || '').toLowerCase();
  if (adminEmails.length > 0 && adminEmails.includes(email)) return next();

  return res.status(403).json({ success: false, message: 'Forbidden' });
};

const requireSelfOrAdmin = (paramName = 'cand_id') => {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const candId = req.params?.[paramName];
    if (candId && String(candId) === String(req.session.user.cand_id)) return next();

    const adminEmails = String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const email = String(req.session.user.email || '').toLowerCase();
    const isAdmin =
      String(req.session.user.role || '').toLowerCase() === 'admin' ||
      req.session.user.is_admin === true ||
      (adminEmails.length > 0 && adminEmails.includes(email));
    if (isAdmin) return next();

    return res.status(403).json({ success: false, message: 'Forbidden' });
  };
};

module.exports = { requireAuth, requireAdmin, requireSelfOrAdmin };
