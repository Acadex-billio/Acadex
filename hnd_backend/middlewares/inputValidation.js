/**
 * Input Validation Middleware
 * Sanitizes and validates user input to prevent injection attacks
 */

const mongoose = require('mongoose');
const { ValidationError } = require('../utils/errorHandler');

// Sanitize MongoDB queries to prevent NoSQL injection
const sanitizeMongoQuery = (query) => {
  if (typeof query !== 'object' || query === null) {
    return query;
  }

  const sanitized = {};
  
  for (const [key, value] of Object.entries(query)) {
    // Allow only safe MongoDB operators
    if (key.startsWith('$')) {
      const allowedOperators = [
        '$eq',
        '$ne',
        '$gt',
        '$gte',
        '$lt',
        '$lte',
        '$in',
        '$nin',
        '$regex',
        '$options',
        '$and',
        '$or',
        '$not',
        '$exists',
        '$size',
        '$type',
      ];
      if (!allowedOperators.includes(key)) {
        continue; // Skip dangerous operators
      }
    }
    
    // Recursively sanitize nested objects
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeMongoQuery(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'object' && item !== null ? sanitizeMongoQuery(item) : item
      );
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

// Validate ObjectId
const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format`
      });
    }
    
    next();
  };
};

// Validate email format
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Email validation middleware
const validateEmailInput = (req, res, next) => {
  const { email } = req.body;
  
  if (email && !validateEmail(email)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid email format'
    });
  }
  
  next();
};

// Password strength validation
const validatePasswordStrength = (password) => {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  
  if (!/(?=.*\d)/.test(password)) {
    return 'Password must contain at least one number';
  }
  
  return null; // Password is valid
};

// Password validation middleware
const validatePasswordInput = (req, res, next) => {
  const { password, newPassword } = req.body;
  const passwordToCheck = password || newPassword;
  
  if (passwordToCheck) {
    const error = validatePasswordStrength(passwordToCheck);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error
      });
    }
  }
  
  next();
};

// Sanitize string input (remove HTML tags, trim whitespace)
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  
  return str
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .trim()
    .replace(/\s+/g, ' '); // Normalize whitespace
};

// String sanitization middleware
const sanitizeStringInput = (fields = []) => {
  return (req, res, next) => {
    for (const field of fields) {
      if (req.body[field]) {
        req.body[field] = sanitizeString(req.body[field]);
      }
    }
    next();
  };
};

// General input validation middleware
const validateRequiredFields = (fields) => {
  return (req, res, next) => {
    const missingFields = fields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }
    
    next();
  };
};

// Rate limiting for sensitive operations
const createRateLimit = (windowMs, max, message) => {
  const rateLimit = require('express-rate-limit');
  
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message: message || 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.warn('[Rate Limit] Exceeded:', {
        ip: req.ip,
        url: req.url,
        userAgent: req.get('User-Agent')
      });
      res.status(429).json({
        success: false,
        message: message || 'Too many requests, please try again later'
      });
    }
  });
};

// Specific rate limiters
const authRateLimit = createRateLimit(15 * 60 * 1000, 5, 'Too many authentication attempts, please try again later');
const passwordResetRateLimit = createRateLimit(60 * 60 * 1000, 3, 'Too many password reset attempts, please try again later');
const uploadRateLimit = createRateLimit(60 * 60 * 1000, 20, 'Too many upload attempts, please try again later');

// MongoDB query sanitization middleware
const sanitizeQuery = (req, res, next) => {
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeMongoQuery(req.query);
  }
  next();
};

module.exports = {
  sanitizeMongoQuery,
  validateObjectId,
  validateEmail,
  validateEmailInput,
  validatePasswordStrength,
  validatePasswordInput,
  sanitizeString,
  sanitizeStringInput,
  validateRequiredFields,
  createRateLimit,
  authRateLimit,
  passwordResetRateLimit,
  uploadRateLimit,
  sanitizeQuery
};
