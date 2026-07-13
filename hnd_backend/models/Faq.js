const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, index: true },
    content: { type: String, required: true },
    audience: { type: String, enum: ['candidate', 'admin', 'all'], default: 'candidate', index: true },
    published: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
    created_by: { type: String, default: null },
  },
  { timestamps: true }
);

faqSchema.index({ published: 1, order: 1 });

module.exports = mongoose.model('Faq', faqSchema);
