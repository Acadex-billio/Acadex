const mongoose = require('mongoose');

const beneficiarySchema = new mongoose.Schema(
  {
    user_cand_id: { type: String, default: null, trim: true },
    phone: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    name: { type: String, default: null, trim: true },
    method: { type: String, default: null, trim: true },
    external_id: { type: String, required: true, trim: true },
    resource_type: { type: String, default: null, trim: true },
    resource_id: { type: String, default: null, trim: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending', index: true },
    message: { type: String, default: null, trim: true },
  },
  { _id: false }
);

const payoutBatchSchema = new mongoose.Schema(
  {
    batch_uuid: { type: String, required: true, unique: true, trim: true, index: true },
    reference: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: null, trim: true },
    callback_url: { type: String, default: null, trim: true },
    provider: { type: String, default: 'camerpay', trim: true },
    type: { type: String, enum: ['candidate_project', 'lecturer_monthly'], required: true, index: true },
    status: { type: String, enum: ['pending_approval', 'processing', 'completed', 'failed', 'cancelled'], default: 'pending_approval', index: true },
    total_amount: { type: Number, required: true, min: 0 },
    beneficiary_count: { type: Number, required: true, min: 0 },
    estimated_fees: { type: Number, default: 0, min: 0 },
    provider_response: { type: mongoose.Schema.Types.Mixed, default: null },
    beneficiaries: { type: [beneficiarySchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    created_by: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PayoutBatch', payoutBatchSchema);
