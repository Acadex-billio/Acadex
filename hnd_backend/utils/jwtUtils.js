/**
 * JWT Token Utilities
 * Handles JWT token generation, verification, and validation
 */

const jwt = require('jsonwebtoken');
const TokenBlacklist = require('../models/TokenBlacklist');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Ensure JWT_SECRET is set and meets minimum security requirements
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long for security. Current length: ' + JWT_SECRET.length);
}

/**
 * Generate JWT token for user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  const payload = {
    cand_id: user.cand_id,
    email: user.email,
    name: user.name || 'Guest',
    dpt_id: user.dpt_id || null,
    role: user.role || 'candidate',
    is_admin: user.role === 'admin' || user.role === 'developer' || user.role === 'superadmin',
    program: String(user.program || 'HND').toUpperCase(),
    preferred_language: String(user.preferred_language || 'en').toLowerCase(),
    account_status: user.account_status || 'active'
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
const verifyToken = async (token) => {
  try {
    // Check if token is blacklisted
    const blacklisted = await TokenBlacklist.findOne({ token });
    if (blacklisted) {
      throw new Error('Token has been revoked');
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
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
 * Extract token from Authorization header
 * @param {Object} req - Express request object
 * @returns {string|null} JWT token or null
 */
const extractTokenFromHeader = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

/**
 * Middleware to verify JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
/**
 * Authenticate JWT token (returns decoded payload)
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
const authenticateToken = async (token) => {
  if (!token) {
    throw new Error('Access token required');
  }

  const decoded = await verifyToken(token);
  return decoded;
};

/**
 * JWT Authentication Middleware
 * @param {Object} req - Express request
 * @returns {Object} Decoded token payload
 */
const jwtAuthMiddleware = async (req) => {
  const token = extractTokenFromHeader(req);
  
  if (!token) {
    throw new Error('Access token required');
  }

  const decoded = await authenticateToken(token);
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
  verifyToken,
  blacklistToken,
  isTokenBlacklisted,
  extractTokenFromHeader,
  authenticateToken,
  jwtAuthMiddleware,
  requireAuth,
  isAdmin,
  isSelfOrAdmin,
  JWT_SECRET,
  JWT_EXPIRES_IN
};
