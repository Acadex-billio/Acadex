/**
 * Request validation utilities
 */

const sanitizeString = (val, maxLen = 500) => {
  if (val == null) return '';
  const s = String(val).trim();
  return s.slice(0, maxLen);
};

const sanitizeFilename = (filename) => {
  if (!filename || typeof filename !== 'string') return null;
  const basename = require('path').basename(filename);
  if (basename.includes('..') || basename.includes('/') || basename.includes('\\')) {
    return null;
  }
  return basename;
};

module.exports = { sanitizeString, sanitizeFilename };
