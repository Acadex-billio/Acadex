'use strict';

const { Router } = require('express');
const multer     = require('multer');
const { ingest, query, list, health } = require('../controllers/ragController');
const { requireAuth, requireAdmin } = require('../middlewares/jwtAuth');

// Store PDF uploads in memory (as Buffer) — no temp files on disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only PDF files are accepted'));
  },
});

const router = Router();

/**
 * POST /api/rag/query        — query the knowledge base (open to all)
 * POST /api/rag/ingest       — ingest a document         (admin only)
 * GET  /api/rag/documents    — list ingested documents   (admin only)
 */
router.post('/query',     query);
router.get('/health',     health);
router.post('/ingest',    requireAuth, requireAdmin, upload.single('file'), ingest);
router.get('/documents',  requireAuth, requireAdmin, list);

module.exports = router;
