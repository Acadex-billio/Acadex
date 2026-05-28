/**
 * File upload validation middleware
 * Allowed: pdf, doc, docx, ppt, pptx, jpeg, jpg, png (for profile)
 */
const path = require('path');

const ALLOWED_EXTENSIONS = {
  documents: ['.pdf', '.doc', '.docx', '.ppt', '.pptx'],
  images: ['.jpeg', '.jpg', '.png'],
};

const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

const MAX_DOC_FILE_SIZES = {
  '.pdf': 15 * 1024 * 1024,
  '.doc': 20 * 1024 * 1024,
  '.docx': 20 * 1024 * 1024,
  '.ppt': 25 * 1024 * 1024,
  '.pptx': 25 * 1024 * 1024,
};

const MIME_ALIASES = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword', 'application/octet-stream'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
  ],
  '.ppt': ['application/vnd.ms-powerpoint', 'application/octet-stream'],
  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/octet-stream',
  ],
};

/**
 * Validate file for document uploads (papers, reports, presentations)
 */
const validateDocumentUpload = (req, res, next) => {
  if (!req.file) return next();
  const ext = path.extname(req.file.originalname).toLowerCase();
  const allowed = [...ALLOWED_EXTENSIONS.documents];
  if (!allowed.includes(ext)) {
    return res.status(400).json({
      success: false,
      message: `Invalid file type. Allowed: ${allowed.join(', ')}`,
    });
  }
  const expectedMimeTypes = MIME_ALIASES[ext] || (MIME_TYPES[ext] ? [MIME_TYPES[ext]] : []);
  const providedMimeType = String(req.file.mimetype || '').toLowerCase();
  if (expectedMimeTypes.length > 0 && !expectedMimeTypes.includes(providedMimeType)) {
    return res.status(400).json({
      success: false,
      message: `Invalid file MIME type for ${ext}.`,
    });
  }
  const maxFileSize = MAX_DOC_FILE_SIZES[ext] || (15 * 1024 * 1024);
  if (req.file.size > maxFileSize) {
    return res.status(400).json({
      success: false,
      message: `File too large. Max size for ${ext}: ${maxFileSize / 1024 / 1024}MB`,
    });
  }
  // Sanitize filename - prevent directory traversal
  const basename = path.basename(req.file.originalname);
  if (basename !== req.file.originalname || basename.includes('..')) {
    return res.status(400).json({ success: false, message: 'Invalid filename' });
  }
  next();
};

/**
 * Validate file for profile picture upload
 */
const validateProfileImage = (req, res, next) => {
  if (!req.file) return next();
  const ext = path.extname(req.file.originalname).toLowerCase();
  const allowed = [...ALLOWED_EXTENSIONS.images];
  if (!allowed.includes(ext)) {
    return res.status(400).json({
      success: false,
      message: `Invalid image type. Allowed: ${allowed.join(', ')}`,
    });
  }
  const maxImageSize = 5 * 1024 * 1024; // 5MB
  if (req.file.size > maxImageSize) {
    return res.status(400).json({
      success: false,
      message: 'Image too large. Max size: 5MB',
    });
  }
  next();
};

module.exports = { validateDocumentUpload, validateProfileImage, ALLOWED_EXTENSIONS };
