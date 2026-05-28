/**
 * Department Controller
 */
const Department = require('../models/Department');
const User = require('../models/User');

exports.getAll = async (req, res) => {
  try {
    const program = String(req.query?.program || '').trim().toUpperCase();
    const query = ['HND', 'BTS'].includes(program) ? { program } : {};
    const depts = await Department.find(query).sort({ department_name: 1 }).lean();
    res.json(depts);
  } catch (err) {
    console.error('[Department] Fetch error:', err);
    res.status(500).json({ message: 'Database fetch failed' });
  }
};

exports.getAllFormatted = async (req, res) => {
  try {
    const program = String(req.query?.program || '').trim().toUpperCase();
    const query = ['HND', 'BTS'].includes(program) ? { program } : {};
    const depts = await Department.find(query).sort({ department_name: 1 }).lean();
    res.json(depts.map((d) => ({
      dpt_id: d._id.toString(),
      department_name: d.department_name,
      abbreviation: d.abbreviation,
      program: String(d.program || 'HND').toUpperCase(),
      motto: d.motto,
      faculty: d.faculty,
      description: d.description,
    })));
  } catch (err) {
    console.error('[Department] Fetch error:', err);
    res.status(500).json({ message: 'Database fetch failed' });
  }
};

exports.create = async (req, res) => {
  try {
    const { department_name, abbreviation, motto, faculty, description, program } = req.body;
    if (!department_name || !abbreviation || !motto || !faculty || !description || !program) {
      return res.status(400).json({ message: 'All fields required.' });
    }

    const normalizedProgram = String(program || '').trim().toUpperCase();
    if (!['HND', 'BTS'].includes(normalizedProgram)) {
      return res.status(400).json({ message: 'Program must be HND or BTS.' });
    }

    const existing = await Department.findOne({
      $or: [
        { department_name: department_name.trim(), program: normalizedProgram },
        { abbreviation: abbreviation.trim().toUpperCase(), program: normalizedProgram },
      ],
    });
    if (existing) {
      return res.status(400).json({
        message: 'Department name or abbreviation already exists.',
      });
    }

    const dept = await Department.create({
      department_name: department_name.trim(),
      abbreviation: abbreviation.trim().toUpperCase(),
      program: normalizedProgram,
      motto: motto.trim(),
      faculty: faculty.trim(),
      description: description.trim(),
    });

    res.status(201).json({
      message: 'Department added successfully',
      id: dept._id,
    });
  } catch (err) {
    console.error('[Department] Create error:', err);
    res.status(500).json({ message: 'Insert failed.' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { department_name, abbreviation, motto, faculty, description, program } = req.body;
    if (!department_name || !abbreviation || !motto || !faculty || !description || !program) {
      return res.status(400).json({ message: 'All fields required.' });
    }

    const normalizedProgram = String(program || '').trim().toUpperCase();
    if (!['HND', 'BTS'].includes(normalizedProgram)) {
      return res.status(400).json({ message: 'Program must be HND or BTS.' });
    }

    const dept = await Department.findById(id);
    if (!dept) return res.status(404).json({ message: 'Department not found.' });

    const name = department_name.trim();
    const abbr = abbreviation.trim().toUpperCase();

    const existing = await Department.findOne({
      _id: { $ne: dept._id },
      program: normalizedProgram,
      $or: [{ department_name: name }, { abbreviation: abbr }],
    }).lean();
    if (existing) {
      return res.status(400).json({ message: 'Department name or abbreviation already exists.' });
    }

    dept.department_name = name;
    dept.abbreviation = abbr;
    dept.program = normalizedProgram;
    dept.motto = motto.trim();
    dept.faculty = faculty.trim();
    dept.description = description.trim();
    await dept.save();

    return res.json({ message: 'Department updated successfully' });
  } catch (err) {
    console.error('[Department] Update error:', err);
    return res.status(500).json({ message: 'Update failed.' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    const dept = await Department.findById(id).lean();
    if (!dept) return res.status(404).json({ message: 'Department not found.' });

    const hasUsers = await User.exists({ dpt_id: id });
    if (hasUsers) {
      return res.status(409).json({ message: 'Cannot delete department: candidates are assigned to it.' });
    }

    await Department.deleteOne({ _id: id });
    return res.json({ message: 'Department deleted successfully' });
  } catch (err) {
    console.error('[Department] Delete error:', err);
    return res.status(500).json({ message: 'Delete failed.' });
  }
};

exports.getOverview = async (req, res) => {
  try {
    const departments = await Department.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'dpt_id',
          as: 'candidates',
        },
      },
      {
        $project: {
          dpt_id: '$_id',
          name: '$department_name',
          abbreviation: 1,
          count: { $size: '$candidates' },
        },
      },
      { $sort: { name: 1 } },
    ]);

    res.json({ departments });
  } catch (err) {
    console.error('[Department] Overview error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

exports.getTopDepartmentTrends = async (req, res) => {
  try {
    const months = Math.max(3, Math.min(12, Number.parseInt(req.query.months, 10) || 6));
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    const topDepartments = await User.aggregate([
      { $match: { role: 'candidate', dpt_id: { $ne: null } } },
      { $group: { _id: '$dpt_id', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 3 },
    ]);

    const departmentIds = topDepartments.map((row) => row._id).filter(Boolean);

    const trends = await User.aggregate([
      { $match: { role: 'candidate', dpt_id: { $in: departmentIds }, createdAt: { $gte: start } } },
      {
        $group: {
          _id: {
            dpt_id: '$dpt_id',
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'departments',
          localField: '_id.dpt_id',
          foreignField: '_id',
          as: 'department',
        },
      },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          dpt_id: '$_id.dpt_id',
          year: '$_id.year',
          month: '$_id.month',
          count: 1,
          department_name: '$department.department_name',
          abbreviation: '$department.abbreviation',
        },
      },
      { $sort: { department_name: 1, year: 1, month: 1 } },
    ]);

    const monthLabels = [];
    const monthMap = new Map();
    for (let i = 0; i < months; i += 1) {
      const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const label = date.toLocaleString('default', { month: 'short' });
      monthLabels.push(label);
      monthMap.set(`${date.getFullYear()}-${date.getMonth() + 1}`, i);
    }

    const trendMap = new Map();
    trends.forEach((item) => {
      const key = String(item.dpt_id);
      if (!trendMap.has(key)) {
        trendMap.set(key, {
          department_name: item.department_name || item.abbreviation || 'Unknown',
          abbreviation: item.abbreviation || item.department_name || 'Unknown',
          counts: Array(months).fill(0),
        });
      }
      const row = trendMap.get(key);
      const index = monthMap.get(`${item.year}-${item.month}`);
      if (Number.isFinite(index)) {
        row.counts[index] = item.count;
      }
    });

    const series = Array.from(trendMap.values());

    res.json({
      success: true,
      months,
      labels: monthLabels,
      series,
    });
  } catch (err) {
    console.error('[Department] Trend error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};
