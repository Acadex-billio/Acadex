const InternshipTopic = require('../models/InternshipTopic');
const Department = require('../models/Department');

function parseIntSafe(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function coerceStringArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);

  try {
    const parsed = JSON.parse(String(v));
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x || '').trim()).filter(Boolean);
    }
  } catch (_) {}

  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeProgram(v) {
  return String(v || 'HND').trim().toUpperCase() === 'BTS' ? 'BTS' : 'HND';
}

function normalizeReaction(v) {
  const value = String(v || '').trim().toLowerCase();
  if (value === 'up' || value === 'down') return value;
  return null;
}

function parseCitations(v) {
  const values = coerceStringArray(v);
  return values.map((text) => ({ text }));
}

function parseKeywords(v) {
  return coerceStringArray(v).map((keyword) => keyword.toLowerCase());
}

function buildDepartmentMap(departments) {
  return new Map((departments || []).map((d) => [String(d._id), d]));
}

function summarizeTopic(topic, currentCandId, departmentMap, includeKeywords = false) {
  const ratings = Array.isArray(topic.ratings) ? topic.ratings : [];
  const recommendations = Array.isArray(topic.recommendations) ? topic.recommendations : [];
  const reactions = Array.isArray(topic.reactions) ? topic.reactions : [];

  const ratingCount = ratings.length;
  const ratingAverage = ratingCount > 0
    ? Number((ratings.reduce((sum, item) => sum + Number(item.stars || 0), 0) / ratingCount).toFixed(2))
    : 0;

  const upReactions = reactions.filter((r) => r.type === 'up').length;
  const downReactions = reactions.filter((r) => r.type === 'down').length;

  const myRating = currentCandId ? ratings.find((r) => String(r.cand_id) === String(currentCandId)) : null;
  const myReaction = currentCandId ? reactions.find((r) => String(r.cand_id) === String(currentCandId)) : null;

  const departmentIds = Array.isArray(topic.department_ids) ? topic.department_ids.map((d) => String(d)) : [];
  const departments = departmentIds
    .map((id) => departmentMap.get(id))
    .filter(Boolean)
    .map((d) => ({
      department_id: d._id,
      department_name: d.department_name,
      abbreviation: d.abbreviation,
      faculty: d.faculty || null,
    }));

  const payload = {
    topic_id: topic._id,
    title: topic.title,
    description: topic.description,
    research_guide: topic.research_guide,
    program: topic.program,
    departments,
    citations: Array.isArray(topic.citations) ? topic.citations.map((c) => ({ text: c.text })) : [],
    metrics: {
      rating_average: ratingAverage,
      rating_count: ratingCount,
      recommendation_count: recommendations.length,
      reaction_up_count: upReactions,
      reaction_down_count: downReactions,
    },
    my_feedback: {
      stars: myRating ? Number(myRating.stars || 0) : 0,
      recommended: currentCandId ? recommendations.includes(String(currentCandId)) : false,
      reaction: myReaction ? myReaction.type : null,
    },
    created_at: topic.createdAt,
    updated_at: topic.updatedAt,
  };

  if (includeKeywords) {
    payload.keywords = Array.isArray(topic.keywords) ? topic.keywords : [];
  }

  return payload;
}

async function getDepartmentsForTopics(topics) {
  const ids = Array.from(
    new Set(
      (topics || [])
        .flatMap((topic) => (Array.isArray(topic.department_ids) ? topic.department_ids : []))
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  );

  if (!ids.length) return [];
  return Department.find({ _id: { $in: ids } })
    .select('department_name abbreviation faculty')
    .lean();
}

exports.createTopic = async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const researchGuide = String(req.body?.research_guide || '').trim();
    const program = normalizeProgram(req.body?.program);
    const departmentIds = coerceStringArray(req.body?.department_ids);
    const keywords = parseKeywords(req.body?.keywords);
    const citations = parseCitations(req.body?.citations);

    if (!title || !description || !researchGuide) {
      return res.status(400).json({ success: false, message: 'Title, description, and research guide are required.' });
    }

    if (!departmentIds.length) {
      return res.status(400).json({ success: false, message: 'Select at least one applicable department.' });
    }

    const departments = await Department.find({ _id: { $in: departmentIds }, program }).select('_id').lean();
    if (!departments.length) {
      return res.status(400).json({ success: false, message: 'No valid departments found for the selected program.' });
    }

    const doc = await InternshipTopic.create({
      title,
      description,
      research_guide: researchGuide,
      program,
      department_ids: departments.map((d) => d._id),
      keywords,
      citations,
      created_by: req.user?.cand_id || req.user?.email || null,
      ratings: [],
      recommendations: [],
      reactions: [],
    });

    return res.status(201).json({ success: true, topic_id: doc._id });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to create topic' });
  }
};

exports.listAdminTopics = async (req, res) => {
  try {
    const page = clamp(parseIntSafe(req.query?.page, 1), 1, 1000000);
    const limit = clamp(parseIntSafe(req.query?.limit, 20), 1, 100);
    const query = {};

    const program = String(req.query?.program || '').trim().toUpperCase();
    if (program === 'HND' || program === 'BTS') query.program = program;

    const search = String(req.query?.q || '').trim();
    if (search) {
      query.$text = { $search: search };
    }

    const [rows, total] = await Promise.all([
      InternshipTopic.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      InternshipTopic.countDocuments(query),
    ]);

    const departments = await getDepartmentsForTopics(rows);
    const departmentMap = buildDepartmentMap(departments);

    return res.json({
      success: true,
      topics: rows.map((topic) => summarizeTopic(topic, null, departmentMap, true)),
      pagination: { page, limit, total },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to list topics' });
  }
};

exports.updateTopic = async (req, res) => {
  try {
    const topicId = String(req.params?.topicId || '').trim();
    const topic = await InternshipTopic.findById(topicId);
    if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

    const title = String(req.body?.title || topic.title).trim();
    const description = String(req.body?.description || topic.description).trim();
    const researchGuide = String(req.body?.research_guide || topic.research_guide).trim();
    const program = normalizeProgram(req.body?.program || topic.program);
    const departmentIds = coerceStringArray(req.body?.department_ids || topic.department_ids);
    const keywords = parseKeywords(req.body?.keywords || topic.keywords);
    const citations = parseCitations(req.body?.citations || topic.citations.map((c) => c.text));

    if (!title || !description || !researchGuide) {
      return res.status(400).json({ success: false, message: 'Title, description, and research guide are required.' });
    }

    if (!departmentIds.length) {
      return res.status(400).json({ success: false, message: 'Select at least one applicable department.' });
    }

    const departments = await Department.find({ _id: { $in: departmentIds }, program }).select('_id').lean();
    if (!departments.length) {
      return res.status(400).json({ success: false, message: 'No valid departments found for the selected program.' });
    }

    topic.title = title;
    topic.description = description;
    topic.research_guide = researchGuide;
    topic.program = program;
    topic.department_ids = departments.map((d) => d._id);
    topic.keywords = keywords;
    topic.citations = citations;

    await topic.save();

    return res.json({ success: true, topic_id: topic._id });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to update topic' });
  }
};

exports.deleteTopic = async (req, res) => {
  try {
    const topicId = String(req.params?.topicId || '').trim();
    const deleted = await InternshipTopic.findByIdAndDelete(topicId).lean();
    if (!deleted) return res.status(404).json({ success: false, message: 'Topic not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to delete topic' });
  }
};

exports.listCandidateTopics = async (req, res) => {
  try {
    const candId = String(req.user?.cand_id || '').trim();
    if (!candId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const program = normalizeProgram(req.user?.program || 'HND');
    const search = String(req.query?.q || '').trim();
    const departmentFilter = String(req.query?.department_id || '').trim();
    const minRating = Math.max(0, Math.min(5, Number(req.query?.min_rating || 0)));
    const sortBy = String(req.query?.sort || 'newest').trim().toLowerCase();

    const query = { program };
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { research_guide: { $regex: search, $options: 'i' } },
        { keywords: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    if (departmentFilter) {
      query.department_ids = departmentFilter;
    }

    const rows = await InternshipTopic.find(query).lean();
    const departments = await getDepartmentsForTopics(rows);
    const departmentMap = buildDepartmentMap(departments);

    let topics = rows.map((topic) => summarizeTopic(topic, candId, departmentMap, false));

    if (minRating > 0) {
      topics = topics.filter((topic) => Number(topic.metrics.rating_average || 0) >= minRating);
    }

    topics.sort((a, b) => {
      if (sortBy === 'rating') return Number(b.metrics.rating_average || 0) - Number(a.metrics.rating_average || 0);
      if (sortBy === 'recommended') return Number(b.metrics.recommendation_count || 0) - Number(a.metrics.recommendation_count || 0);
      if (sortBy === 'popular') {
        const ap = Number(a.metrics.recommendation_count || 0) + Number(a.metrics.reaction_up_count || 0);
        const bp = Number(b.metrics.recommendation_count || 0) + Number(b.metrics.reaction_up_count || 0);
        return bp - ap;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return res.json({ success: true, topics });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load internship topics' });
  }
};

exports.getCandidateTopicDetail = async (req, res) => {
  try {
    const candId = String(req.user?.cand_id || '').trim();
    const program = normalizeProgram(req.user?.program || 'HND');
    const topicId = String(req.params?.topicId || '').trim();

    const topic = await InternshipTopic.findOne({ _id: topicId, program }).lean();
    if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

    const departments = await getDepartmentsForTopics([topic]);
    const departmentMap = buildDepartmentMap(departments);

    return res.json({ success: true, topic: summarizeTopic(topic, candId, departmentMap, false) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load topic details' });
  }
};

exports.rateTopic = async (req, res) => {
  try {
    const candId = String(req.user?.cand_id || '').trim();
    const program = normalizeProgram(req.user?.program || 'HND');
    const topicId = String(req.params?.topicId || '').trim();
    const stars = Math.max(1, Math.min(5, Number(req.body?.stars || 0)));

    if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5 stars.' });
    }

    const topic = await InternshipTopic.findOne({ _id: topicId, program });
    if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

    const existing = topic.ratings.find((item) => String(item.cand_id) === candId);
    if (existing) {
      existing.stars = stars;
      existing.updated_at = new Date();
    } else {
      topic.ratings.push({ cand_id: candId, stars, updated_at: new Date() });
    }

    await topic.save();

    const departments = await getDepartmentsForTopics([topic]);
    const departmentMap = buildDepartmentMap(departments);
    return res.json({ success: true, topic: summarizeTopic(topic.toObject(), candId, departmentMap, false) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to submit rating' });
  }
};

exports.toggleRecommendation = async (req, res) => {
  try {
    const candId = String(req.user?.cand_id || '').trim();
    const program = normalizeProgram(req.user?.program || 'HND');
    const topicId = String(req.params?.topicId || '').trim();

    const topic = await InternshipTopic.findOne({ _id: topicId, program });
    if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

    const idx = topic.recommendations.findIndex((id) => String(id) === candId);
    if (idx >= 0) {
      topic.recommendations.splice(idx, 1);
    } else {
      topic.recommendations.push(candId);
    }

    await topic.save();

    const departments = await getDepartmentsForTopics([topic]);
    const departmentMap = buildDepartmentMap(departments);
    return res.json({ success: true, topic: summarizeTopic(topic.toObject(), candId, departmentMap, false) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to update recommendation' });
  }
};

exports.setReaction = async (req, res) => {
  try {
    const candId = String(req.user?.cand_id || '').trim();
    const program = normalizeProgram(req.user?.program || 'HND');
    const topicId = String(req.params?.topicId || '').trim();
    const type = normalizeReaction(req.body?.type);

    if (!type) {
      return res.status(400).json({ success: false, message: 'Reaction type must be up or down.' });
    }

    const topic = await InternshipTopic.findOne({ _id: topicId, program });
    if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

    const existing = topic.reactions.find((item) => String(item.cand_id) === candId);
    if (existing && existing.type === type) {
      topic.reactions = topic.reactions.filter((item) => String(item.cand_id) !== candId);
    } else if (existing) {
      existing.type = type;
      existing.updated_at = new Date();
    } else {
      topic.reactions.push({ cand_id: candId, type, updated_at: new Date() });
    }

    await topic.save();

    const departments = await getDepartmentsForTopics([topic]);
    const departmentMap = buildDepartmentMap(departments);
    return res.json({ success: true, topic: summarizeTopic(topic.toObject(), candId, departmentMap, false) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to update reaction' });
  }
};
