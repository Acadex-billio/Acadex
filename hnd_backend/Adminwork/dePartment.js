const express = require('express');
const router = express.Router();
const db = require('../Database/db');

// GET departments
router.get('/', (req, res) => {
  const sql = 'SELECT * FROM dpts ORDER BY department_name';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Fetch error:', err);
      return res.status(500).json({ message: 'Database fetch failed' });
    }
    res.json(results);
  });
});

// POST department
router.post('/', (req, res) => {
  const { department_name, abbreviation, motto, faculty, description } = req.body;
  if (!department_name || !abbreviation || !motto || !faculty || !description) {
    return res.status(400).json({ message: 'All fields required.' });
  }

  const checkSql = 'SELECT * FROM dpts WHERE department_name = ? OR abbreviation = ?';
  db.query(checkSql, [department_name, abbreviation], (err, existing) => {
    if (err) {
      console.error('Check error:', err);
      return res.status(500).json({ message: 'Database error during duplication check.' });
    }

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Department name or abbreviation already exists.' });
    }

    const insertSql = `
      INSERT INTO dpts (department_name, abbreviation, motto, faculty, description)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.query(insertSql, [department_name, abbreviation, motto, faculty, description], (err, result) => {
      if (err) {
        console.error('Insert error:', err);
        return res.status(500).json({ message: 'Insert failed.' });
      }

      res.status(201).json({ message: 'Department added successfully', id: result.insertId });
    });
  });
});

module.exports = router;
