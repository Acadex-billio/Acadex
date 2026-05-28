'use strict';

const mongoose = require('mongoose');

const aiMemoryProfileSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, unique: true, index: true },
    tone: {
      type: String,
      enum: ['balanced', 'friendly', 'professional', 'mentor'],
      default: 'balanced',
    },
    answer_depth: {
      type: String,
      enum: ['concise', 'balanced', 'detailed'],
      default: 'balanced',
    },
    response_language: {
      type: String,
      enum: ['en', 'fr'],
      default: 'en',
    },
    memory_turns: { type: Number, min: 3, max: 6, default: 6 },
    strict_hnd_mode: { type: Boolean, default: true },
    show_sources: { type: Boolean, default: false },
    store_conversation: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AiMemoryProfile', aiMemoryProfileSchema);
