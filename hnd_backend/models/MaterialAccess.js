const mongoose = require('mongoose');

const materialAccessSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    materialType: {
      type: String,
      enum: ['questionPaper', 'report', 'presentation'],
      required: true,
    },
    accessType: {
      type: String,
      enum: ['preview', 'download'],
      required: true,
    },
    grantedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      // Expires 1 hour after granted
      set: function(value) {
        return value || new Date(this.grantedAt.getTime() + 60 * 60 * 1000);
      },
    },
    paymentTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentTransaction',
    },
    isActive: {
      type: Boolean,
      default: true,
      // Auto-update based on expiry
      get: function() {
        return this.expiresAt > new Date();
      },
    },
  },
  { timestamps: true }
);

// Auto-index on expiry for cleanup queries
materialAccessSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
materialAccessSchema.index({ userId: 1, materialId: 1, materialType: 1, accessType: 1 });

module.exports = mongoose.model('MaterialAccess', materialAccessSchema);
