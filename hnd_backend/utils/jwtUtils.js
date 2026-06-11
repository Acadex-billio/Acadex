/**
 * JWT Token Utilities
 * Handles JWT token generation, verification, and validation
 */

const jwt = require('jsonwebtoken');
const TokenBlacklist = require('../models/TokenBlacklist');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || JWT_EXPIRES_IN;
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

// Ensure JWT_SECRET is set and meets minimum security requirements
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long for security. Current length: ' + JWT_SECRET.length);
}

const parseCookies = (cookieHeader = '') => {
  return String(cookieHeader)
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((acc, cookie) => {
      const [name, ...rest] = cookie.split('=');
      if (!name) return acc;
      acc[name.trim()] = decodeURIComponent(rest.join('=').trim() || '');
      return acc;
    }, {});
};

const extractTokenFromHeader = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

const extractTokenFromCookie = (req, cookieName) => {
  const cookieHeader = req.headers?.cookie || '';
  const cookies = parseCookies(cookieHeader);
  return cookies[cookieName] || null;
};

const extractAccessToken = (req) => {
  return extractTokenFromHeader(req) || extractTokenFromCookie(req, 'access_token');
};

const extractRefreshToken = (req) => {
  return extractTokenFromCookie(req, 'refresh_token');
};

const createJwtPayload = (user) => ({
  cand_id: user.cand_id,
  email: user.email,
  name: user.name || 'Guest',
  dpt_id: user.dpt_id || null,
  role: user.role || 'candidate',
  is_admin: user.role === 'admin' || user.role === 'developer' || user.role === 'superadmin',
  program: String(user.program || 'HND').toUpperCase(),
  preferred_language: String(user.preferred_language || 'en').toLowerCase(),
  account_status: user.account_status || 'active',
});

/**
 * Generate JWT access token for user
 * @param {Object} user - User object
 * @returns {string} JWT access token
 */
const generateAccessToken = (user) => {
  return jwt.sign({ ...createJwtPayload(user), token_type: 'access' }, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  });
};

/**
 * Generate JWT refresh token for user
 * @param {Object} user - User object
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (user) => {
  return jwt.sign({ ...createJwtPayload(user), token_type: 'refresh' }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @param {string|null} expectedType - Expected token_type claim ('access' or 'refresh')
 * @returns {Object} Decoded token payload
 */
const verifyToken = async (token, expectedType = null) => {
  try {
    // Check if token is blacklisted
    const blacklisted = await TokenBlacklist.findOne({ token });
    if (blacklisted) {
      throw new Error('Token has been revoked');
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (expectedType && decoded.token_type !== expectedType) {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Blacklist a token (for logout)
 * @param {string} token - JWT token to blacklist
 */
const blacklistToken = async (token) => {
  if (token && typeof token === 'string') {
    try {
      // Decode token to get expiration
      const decoded = jwt.decode(token);
      const expiresAt = new Date(decoded.exp * 1000);
      
      await TokenBlacklist.findOneAndUpdate(
        { token },
        { token, expiresAt },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error('Error blacklisting token:', error);
    }
  }
};

/**
 * Check if token is blacklisted
 * @param {string} token - JWT token to check
 * @returns {boolean} True if token is blacklisted
 */
const isTokenBlacklisted = async (token) => {
  if (!token) return false;
  const blacklisted = await TokenBlacklist.findOne({ token });
  return !!blacklisted;
};

/**
 * Authenticate JWT token (returns decoded payload)
 * @param {string} token - JWT token
 * @param {string|null} expectedType - Expected token_type claim ('access' or 'refresh')
 * @returns {Object} Decoded token payload
 */
const authenticateToken = async (token, expectedType = 'access') => {
  if (!token) {
    throw new Error('Access token required');
  }

  const decoded = await verifyToken(token, expectedType);
  return decoded;
};

/**
 * JWT Authentication Middleware
 * @param {Object} req - Express request
 * @returns {Object} Decoded token payload
 */
const jwtAuthMiddleware = async (req) => {
  const token = extractAccessToken(req);
  if (!token) {
    throw new Error('Access token required');
  }

  const decoded = await authenticateToken(token, 'access');
  return decoded;
};

/**
 * Express middleware wrapper for JWT auth
 */
const requireAuth = async (req, res, next) => {
  try {
    req.user = await jwtAuthMiddleware(req);
    next();
  } catch (error) {
    console.error('[JWT Auth] Token verification failed:', error.message);
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid or expired token' 
    });
  }
};

/**
 * Check if user is admin
 * @param {Object} req - Express request object
 * @returns {boolean} True if user is admin
 */
const isAdmin = (req) => {
  return req.user && (req.user.role === 'admin' || req.user.role === 'developer' || req.user.role === 'superadmin' || req.user.is_admin === true);
};

/**
 * Check if user is self or admin
 * @param {Object} req - Express request object
 * @param {string} candId - Candidate ID to check
 * @returns {boolean} True if user is self or admin
 */
const isSelfOrAdmin = (req, candId) => {
  return req.user && (req.user.cand_id === candId || isAdmin(req));
};

module.exports = {
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  blacklistToken,
  isTokenBlacklisted,
  extractTokenFromHeader,
  extractAccessToken,
  extractRefreshToken,
  authenticateToken,
  jwtAuthMiddleware,
  requireAuth,
  isAdmin,
  isSelfOrAdmin,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
};
