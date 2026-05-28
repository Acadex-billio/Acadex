'use strict';

const mongoose = require('mongoose');

const sessionAnswerSchema = new mongoose.Schema(
  {
    question_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    selected_option: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    is_correct: { type: Boolean, required: true },
    answered_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const aiStudySessionSchema = new mongoose.Schema(
  {
    candidate_cand_id: { type: String, required: true, trim: true, index: true },
    material_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AiStudyMaterial',
      required: true,
      index: true,
    },
    question_order: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
    current_index: { type: Number, default: 0, min: 0 },
    answers: { type: [sessionAnswerSchema], default: [] },
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress', index: true },
    score: { type: Number, default: 0, min: 0 },
    total_questions: { type: Number, default: 20, min: 1 },
    started_at: { type: Date, default: Date.now },
    completed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

aiStudySessionSchema.index({ candidate_cand_id: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('AiStudySession', aiStudySessionSchema);
