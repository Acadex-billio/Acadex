'use strict';

const mongoose = require('mongoose');

const studyQuestionSchema = new mongoose.Schema(
  {
    question_text: { type: String, required: true, trim: true },
    option_a: { type: String, required: true, trim: true },
    option_b: { type: String, required: true, trim: true },
    option_c: { type: String, required: true, trim: true },
    option_d: { type: String, required: true, trim: true },
    correct_option: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    correct_answer_text: { type: String, default: '', trim: true },
    reason: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const aiStudyMaterialSchema = new mongoose.Schema(
  {
    question_paper_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionPaper',
      required: true,
      index: true,
    },
    paper_title: { type: String, required: true, trim: true },
    program: { type: String, enum: ['HND', 'BTS'], default: 'HND', index: true },
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    question_count: { type: Number, required: true, min: 1 },
    questions: { type: [studyQuestionSchema], default: [] },
    created_by: { type: String, required: true, trim: true, index: true },
    is_active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

aiStudyMaterialSchema.index({ program: 1, createdAt: -1 });
aiStudyMaterialSchema.index({ departments: 1, is_active: 1 });

module.exports = mongoose.model('AiStudyMaterial', aiStudyMaterialSchema);
