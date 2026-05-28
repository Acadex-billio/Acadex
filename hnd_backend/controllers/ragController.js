'use strict';

const { ingestDocument, queryKnowledge, listDocuments, getRagStatus } = require('../services/ragService');

/**
 * POST /api/rag/ingest
 * Admin-only. Ingest a document (raw text or PDF) into the RAG knowledge base.
 * Accepts multipart/form-data with an optional 'file' field (PDF)
 * or a JSON body with a 'text' field.
 */
const ingest = async (req, res) => {
  try {
    const source    = String(req.body?.source || 'Unnamed document').slice(0, 300);
    const text      = req.body?.text ? String(req.body.text).slice(0, 100000) : null;
    const pdfBuffer = req.file?.buffer || null;

    if (!text && !pdfBuffer) {
      return res.status(400).json({
        success: false,
        message: 'Provide either a "text" field or upload a PDF file.',
      });
    }

    const result = await ingestDocument({ text, pdfBuffer, source });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[RAG] Ingest error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Ingest failed' });
  }
};

/**
 * POST /api/rag/query
 * Query the RAG knowledge base with a natural-language question.
 * Returns the most relevant context chunks as a structured answer.
 */
const query = async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();

    if (!text) {
      return res.status(400).json({ success: false, message: 'text is required' });
    }
    if (text.length > 1000) {
      return res.status(400).json({ success: false, message: 'Query must be 1000 characters or fewer' });
    }

    const topK   = Math.min(Math.max(Number(req.body?.topK) || 5, 1), 10);
    const result = await queryKnowledge(text, topK);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[RAG] Query error:', err.message);
    return res.status(500).json({ success: false, message: 'RAG query failed' });
  }
};

/**
 * GET /api/rag/documents
 * Admin-only. List all ingested documents (metadata from MongoDB).
 */
const list = async (req, res) => {
  try {
    const docs = await listDocuments();
    return res.json({ success: true, documents: docs });
  } catch (err) {
    console.error('[RAG] List error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not list documents' });
  }
};

const health = async (_req, res) => {
  try {
    const status = await getRagStatus();
    return res.json({ success: true, ...status });
  } catch (err) {
    console.error('[RAG] Health error:', err.message);
    return res.status(500).json({ success: false, message: 'RAG health check failed' });
  }
};

module.exports = { ingest, query, list, health };
