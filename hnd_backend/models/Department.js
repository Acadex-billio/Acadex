/**
 * Department Model
 */
const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    department_name: { type: String, required: true, trim: true },
    abbreviation: { type: String, required: true, trim: true, uppercase: true },
    program: { type: String, enum: ['HND', 'BTS'], default: 'HND', index: true },
    motto: { type: String, trim: true },
    faculty: { type: String, trim: true },
    description: { type: String, trim: true },
  },
  { timestamps: true }
);

departmentSchema.index({ department_name: 1 });
departmentSchema.index({ abbreviation: 1 }, { unique: true });
departmentSchema.index({ program: 1, department_name: 1 });

module.exports = mongoose.model('Department', departmentSchema);
