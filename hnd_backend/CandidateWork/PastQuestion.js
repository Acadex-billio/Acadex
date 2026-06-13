const express = require('express');
const router = express.Router();
const db = require('../Database/db');

router.get('/papers', (req, res) => {
  const sql = `
    SELECT
      qp_id,
      dpt_id,
      course_title,
      hnd_year,
      paper_file,
      uploaded_by,
      upload_date,
      study_links
    FROM question_papers
    ORDER BY upload_date DESC
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('DB fetch error:', err);
      return res.status(1000).json({ success: false, message: 'Failed to fetch papers' });
    }
    const papers = results.map(p => ({
      ...p,
      study_links: p.study_links ? JSON.parse(p.study_links) : []
    }));
    res.status(200).json({ success: true, papers });
  });
});

module.exports = router;
