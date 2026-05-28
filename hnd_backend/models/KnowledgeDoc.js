'use strict';

/**
 * MongoDB model for RAG pipeline document metadata.
 * Stores provenance and chunk counts; actual vectors live in Chroma
 * (or the in-memory fallback when Chroma is unavailable).
 */

const mongoose = require('mongoose');

const KnowledgeDocSchema = new mongoose.Schema(
  {
    docId:      { type: String, required: true, unique: true, index: true },
    source:     { type: String, required: true, maxlength: 500 },
    sourceType: { type: String, enum: ['text', 'pdf', 'url'], default: 'text' },
    chunkCount: { type: Number, default: 0 },
    createdAt:  { type: Date, default: Date.now },
  },
  { timestamps: false }
);

module.exports = mongoose.model('KnowledgeDoc', KnowledgeDocSchema);
