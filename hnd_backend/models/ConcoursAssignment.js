const mongoose = require('mongoose');

const concoursAssignmentSchema = new mongoose.Schema({
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedBy: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

concoursAssignmentSchema.index({ partnerId: 1, adminId: 1 }, { unique: true });
module.exports = mongoose.model('ConcoursAssignment', concoursAssignmentSchema);
