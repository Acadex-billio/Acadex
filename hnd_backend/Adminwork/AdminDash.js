// File: Adminwork/AdminDash.js
const express = require('express');
const router = express.Router();
const db = require('../Database/db');

// GET department overview
router.get('/departments/overview', async (req, res) => {
  try {
    const sql = `
      SELECT d.dpt_id, d.department_name, d.abbreviation,
             COUNT(u.cand_id) AS candidate_count
      FROM dpts d
      LEFT JOIN users u ON u.dpt_id = d.dpt_id
      GROUP BY d.dpt_id, d.department_name, d.abbreviation
      ORDER BY d.department_name ASC;
    `;

    db.query(sql, (err, results) => {
      if (err) {
        console.error('Error fetching department overview:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      const departments = results.map(row => ({
        dpt_id: row.dpt_id,
        name: row.department_name,
        abbreviation: row.abbreviation,
        count: Number(row.candidate_count) || 0
      }));

      res.json({ departments });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
