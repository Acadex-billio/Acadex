const mongoose = require('mongoose');

const announcementAttachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    originalname: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
);

const announcementReactionSchema = new mongoose.Schema(
  {
    cand_id: { type: String, required: true, index: true },
    emoji: { type: String, required: true },
    reacted_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    source: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    program: { type: String, enum: ['HND', 'BTS'], default: 'HND', index: true },

    audience_type: {
      type: String,
      enum: ['general', 'departments', 'faculty'],
      default: 'general',
      index: true,
    },
    department_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true }],
    faculty: { type: String, default: null, trim: true, index: true },

    attachment: { type: announcementAttachmentSchema, default: null },

    created_by: { type: String, default: null, trim: true, index: true },

    expires_at: { type: Date, required: true },

    reactions: { type: [announcementReactionSchema], default: [] },
  },
  { timestamps: true }
);

announcementSchema.index({ expires_at: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);
