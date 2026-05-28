const mongoose = require('mongoose');

const verificationCodeSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // TTL index
  },
  used: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Ensure only one code per email at a time
verificationCodeSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('VerificationCode', verificationCodeSchema);