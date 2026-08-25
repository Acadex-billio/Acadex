const mongoose = require('mongoose');

const formConditionSchema = new mongoose.Schema({
  fieldId: { type: String, required: true, trim: true, maxlength: 80 },
  operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than'], required: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const formFieldSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, maxlength: 80 },
  type: { type: String, enum: ['short_text', 'long_text', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkbox', 'multi_select', 'file', 'section'], required: true },
  label: { type: String, required: true, trim: true, maxlength: 200 },
  required: { type: Boolean, default: false },
  placeholder: { type: String, trim: true, maxlength: 300, default: '' },
  helpText: { type: String, trim: true, maxlength: 1000, default: '' },
  options: [{ type: String, trim: true, maxlength: 200 }],
  profileKey: { type: String, enum: ['name', 'email', 'phone', 'program', 'address', 'profile_picture', null], default: null },
  editable: { type: Boolean, default: true },
  validation: {
    minLength: { type: Number, min: 0, max: 10000, default: null },
    maxLength: { type: Number, min: 0, max: 10000, default: null },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
  },
  conditions: { type: [formConditionSchema], default: [] },
}, { _id: false });

const applicationFormSchema = new mongoose.Schema({
  version: { type: Number, default: 1, min: 1 },
  fields: { type: [formFieldSchema], default: [] },
  published: { type: Boolean, default: false },
  publishedAt: { type: Date, default: null },
}, { _id: false });

const concoursSchema = new mongoose.Schema({
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  shortDescription: { type: String, required: true, trim: true, maxlength: 600 },
  fullDescription: { type: String, required: true, trim: true, maxlength: 20000 },
  organizationName: { type: String, required: true, trim: true, maxlength: 240 },
  logoUrl: { type: String, default: null, trim: true },
  category: { type: String, required: true, trim: true, maxlength: 120 },
  location: { type: String, trim: true, maxlength: 240, default: '' },
  openingDate: { type: Date, required: true },
  closingDate: { type: Date, required: true, index: true },
  selectionDate: { type: Date, default: null },
  eligibility: { type: String, trim: true, maxlength: 5000, default: '' },
  qualifications: [{ type: String, trim: true, maxlength: 500 }],
  requiredDocuments: [{ type: String, trim: true, maxlength: 200 }],
  instructions: { type: String, trim: true, maxlength: 10000, default: '' },
  contact: { email: String, phone: String, website: String },
  status: { type: String, enum: ['draft', 'published', 'closed', 'archived'], default: 'draft', index: true },
  featured: { type: Boolean, default: false },
  applicationForm: { type: applicationFormSchema, default: () => ({}) },
  createdBy: { type: String, required: true, trim: true },
  updatedBy: { type: String, required: true, trim: true },
}, { timestamps: true });

concoursSchema.index({ status: 1, closingDate: 1, createdAt: -1 });
concoursSchema.index({ partnerId: 1, status: 1, createdAt: -1 });
concoursSchema.index({ category: 1, status: 1, closingDate: 1 });
concoursSchema.index({ title: 'text', shortDescription: 'text', organizationName: 'text' });

module.exports = mongoose.model('Concours', concoursSchema);
