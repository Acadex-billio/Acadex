'use strict';

const mongoose = require('mongoose');

const programSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, immutable: true },
    name: { type: String, required: true, trim: true },
    abbreviation: { type: String, required: true, trim: true, uppercase: true },
    language: { type: String, required: true, enum: ['en', 'fr'], lowercase: true },
    department_track: { type: String, enum: ['HND', 'BTS', null], default: null },
    visibility_group: { type: String, required: true, trim: true, uppercase: true },
    candidate_project_enabled: { type: Boolean, default: false },
    candidate_project_target_code: { type: String, default: null, trim: true, uppercase: true },
    aliases: { type: [String], default: [] },
    is_active: { type: Boolean, default: true, index: true },
    display_order: { type: Number, default: 0 },
    created_by: { type: String, default: null, trim: true },
    updated_by: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

programSchema.index({ code: 1 }, { unique: true });
programSchema.index({ is_active: 1, display_order: 1, name: 1 });

module.exports = mongoose.model('Program', programSchema);