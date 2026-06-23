/**
 * Security Configuration and Hardening
 * Additional security middleware and configurations
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const logger = require('./logger');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const apiWindowMs = parsePositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const apiMax = parsePositiveInt(
  process.env.API_RATE_LIMIT_MAX,
  process.env.NODE_ENV === 'production' ? 3000 : 10000
);
const strictWindowMs = parsePositiveInt(process.env.STRICT_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000);
const strictMax = parsePositiveInt(process.env.STRICT_RATE_LIMIT_MAX, 30);
const uploadWindowMs = parsePositiveInt(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000);
const uploadMax = parsePositiveInt(
  process.env.UPLOAD_RATE_LIMIT_MAX,
  process.env.NODE_ENV === 'production' ? 150 : 500
);

// Enhanced security headers
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", process.env.REACT_APP_API_URL || "http://localhost:5000"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// API-specific rate limiting
const apiRateLimit = rateLimit({
  windowMs: apiWindowMs,
  max: apiMax,
  message: {
    success: false,
    message: 'Too many API requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)[0];
    const clientIp = forwardedFor || req.ip || req.connection?.remoteAddress || 'unknown';
    return clientIp + ':' + (req.headers['user-agent'] || '');
  }
});

// Strict rate limiting for sensitive operations
const strictRateLimit = rateLimit({
  windowMs: strictWindowMs,
  max: strictMax,
  message: {
    success: false,
    message: 'Rate limit exceeded for this operation.'
  },
  skipSuccessfulRequests: false
});

// Upload-specific rate limiting
const uploadRateLimit = rateLimit({
  windowMs: uploadWindowMs,
  max: uploadMax,
  message: {
    success: false,
    message: 'Too many upload attempts, please try again later.'
  }
});

// Request size limiter
const requestSizeLimiter = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength) > parseInt(maxSize)) {
      return res.status(413).json({
        success: false,
        message: 'Request entity too large'
      });
    }
    next();
  };
};

// IP whitelist for admin operations (if configured)
const adminIPWhitelist = (req, res, next) => {
  const allowedIPs = process.env.ADMIN_IP_WHITELIST ? 
    process.env.ADMIN_IP_WHITELIST.split(',').map(ip => ip.trim()) : [];
  
  if (allowedIPs.length > 0 && req.path.startsWith('/api/admin')) {
    const clientIP = req.ip || req.connection.remoteAddress;
    if (!allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied from this IP address'
      });
    }
  }
  next();
};

// Security audit logging
const securityAuditLogger = (req, res, next) => {
  // Log suspicious activities
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i,  // XSS attempts
    /union.*select/i,  // SQL injection attempts
    /\$where/i,  // NoSQL injection attempts
  ];

  const url = req.url;
  const body = JSON.stringify(req.body);
  const query = JSON.stringify(req.query);

  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(url) || pattern.test(body) || pattern.test(query)
  );

  if (isSuspicious) {
    logger.warn('security.alert.suspicious_request', {
      ip: req.ip,
      url: req.url,
      method: req.method,
      userAgent: req.get('User-Agent'),
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString()
    });
  }

  next();
};

// Block common attack patterns
const blockAttackPatterns = (req, res, next) => {
  const blockedPatterns = [
    /\.\.\//,  // Directory traversal
    /<script[^>]*>.*?<\/script>/gi,  // XSS
    /javascript:/i,  // JavaScript protocol
    /on\w+\s*=/i,  // Event handlers
  ];

  const checkString = (str) => {
    return blockedPatterns.some(pattern => pattern.test(str));
  };

  const { url, body, query } = req;
  
  if (checkString(url) || checkString(JSON.stringify(body)) || checkString(JSON.stringify(query))) {
    logger.warn('security.request.blocked_suspicious_pattern', {
      ip: req.ip,
      url: req.url,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(400).json({
      success: false,
      message: 'Invalid request format'
    });
  }

  next();
};

module.exports = {
  securityHeaders,
  apiRateLimit,
  strictRateLimit,
  uploadRateLimit,
  requestSizeLimiter,
  adminIPWhitelist,
  securityAuditLogger,
  blockAttackPatterns
};
