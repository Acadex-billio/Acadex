const mongoose = require('mongoose');

const timelineSchema = new mongoose.Schema({
  status: { type: String, required: true, trim: true },
  note: { type: String, trim: true, maxlength: 2000, default: '' },
  actorId: { type: String, trim: true, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const documentSchema = new mongoose.Schema({
  fieldId: { type: String, required: true, trim: true },
  originalName: { type: String, required: true, trim: true },
  storageKey: { type: String, required: true, trim: true },
  mimeType: { type: String, required: true, trim: true },
  size: { type: Number, required: true, min: 0 },
});

const concoursApplicationSchema = new mongoose.Schema({
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  candidateCandId: { type: String, required: true, trim: true, index: true },
  concoursId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concours', required: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['draft', 'submitted', 'correction_requested', 'resubmitted', 'forwarded', 'received', 'under_review', 'shortlisted', 'rejected', 'selected', 'withdrawn'], default: 'draft', index: true },
  answers: { type: mongoose.Schema.Types.Mixed, default: {} },
  profileSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  documents: { type: [documentSchema], default: [] },
  correctionReason: { type: String, trim: true, maxlength: 2000, default: null },
  correctionRequestedAt: { type: Date, default: null },
  submittedAt: { type: Date, default: null, index: true },
  resubmittedAt: { type: Date, default: null },
  timeline: { type: [timelineSchema], default: [] },
  internalNotes: [{ type: String, trim: true, maxlength: 2000 }],
}, { timestamps: true });

concoursApplicationSchema.index({ candidateId: 1, concoursId: 1 }, { unique: true });
concoursApplicationSchema.index({ partnerId: 1, status: 1, submittedAt: -1 });
concoursApplicationSchema.index({ concoursId: 1, status: 1, submittedAt: -1 });
concoursApplicationSchema.index({ candidateId: 1, createdAt: -1 });

module.exports = mongoose.model('ConcoursApplication', concoursApplicationSchema);
