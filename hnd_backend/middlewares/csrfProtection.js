const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/payment/camerpay/callback',
  '/webhooks/camerpay',
]);

const parseCookies = (header = '') => String(header)
  .split(';')
  .map((part) => part.trim())
  .filter(Boolean)
  .reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return cookies;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});

const issueToken = (res) => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
    sameSite: String(process.env.NODE_ENV || '').toLowerCase() === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
  return token;
};

const csrfProtection = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[CSRF_COOKIE_NAME] || issueToken(res);
  res.setHeader('X-CSRF-Token', cookieToken);
  const path = String(req.path || '').replace(/\/$/, '') || '/';
  const hasAuthenticatedCookieSession = Boolean(cookies.access_token);

  if (SAFE_METHODS.has(String(req.method || '').toUpperCase()) || EXEMPT_PATHS.has(path) || !hasAuthenticatedCookieSession) {
    return next();
  }

  const headerToken = String(req.get(CSRF_HEADER_NAME) || '').trim();
  if (!headerToken || headerToken.length !== cookieToken.length || !crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))) {
    return res.status(403).json({
      success: false,
      code: 'CSRF_TOKEN_INVALID',
      message: 'Security token missing or invalid. Refresh the page and try again.',
    });
  }

  return next();
};

module.exports = { csrfProtection, CSRF_COOKIE_NAME, CSRF_HEADER_NAME };
