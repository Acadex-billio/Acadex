const mongoose = require('mongoose');

const candidateProjectPricingSchema = new mongoose.Schema(
  {
    target_program: { type: String, enum: ['BACHELOR', 'MASTERS', 'LICENCE', 'MASTER', 'BTS'], required: true, unique: true, index: true },
    upload_fee: { type: Number, required: true, min: 0, default: 0 },
    updated_by: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CandidateProjectPricing', candidateProjectPricingSchema);
