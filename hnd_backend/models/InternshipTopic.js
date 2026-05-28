const mongoose = require('mongoose');

const topicRatingSchema = new mongoose.Schema(
  {
    cand_id: { type: String, required: true, trim: true, index: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    updated_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const topicReactionSchema = new mongoose.Schema(
  {
    cand_id: { type: String, required: true, trim: true, index: true },
    type: { type: String, enum: ['up', 'down'], required: true },
    updated_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const citationSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const internshipTopicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    research_guide: { type: String, required: true, trim: true },
    program: { type: String, enum: ['HND', 'BTS'], required: true, index: true },
    department_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true }],
    keywords: [{ type: String, trim: true }],
    citations: [citationSchema],
    created_by: { type: String, default: null, trim: true },

    ratings: [topicRatingSchema],
    recommendations: [{ type: String, trim: true, index: true }],
    reactions: [topicReactionSchema],
  },
  { timestamps: true }
);

internshipTopicSchema.index({ program: 1, createdAt: -1 });
internshipTopicSchema.index({ title: 'text', description: 'text', research_guide: 'text', keywords: 'text' });

module.exports = mongoose.model('InternshipTopic', internshipTopicSchema);
