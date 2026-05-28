// File: routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../Database/db');
const nodemailer = require('nodemailer');

// Ensure upload dir
const reportDir = path.join(__dirname, '../uploads/reports');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, reportDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// Nodemailer (Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

router.post('/upload-report', upload.single('reportDoc'), async (req, res) => {
  const conn = db.promise();
  const {
    audience,        // SINGLE | MULTIPLE | GENERAL
    dpt_id,          // when SINGLE
    dpt_ids,         // when MULTIPLE (JSON string or array)
    title,
    writer_names,
    writer_email,
    description,
    location,
    keywords,
    pages,
    notify,          // 'true' | 'false'
  } = req.body;

  try {
    // Basic checks
    if (!req.file || !title || !writer_names || !writer_email ||
        !description || !location || !keywords || !pages || !audience) {
      return res.status(400).json({ success: false, message: 'Missing required fields or file.' });
    }

    // Normalize department IDs based on audience
    let targetDeptIds = [];
    if (audience === 'SINGLE') {
      if (!dpt_id) return res.status(400).json({ success: false, message: 'Missing dpt_id for SINGLE audience.' });
      targetDeptIds = [dpt_id];
    } else if (audience === 'MULTIPLE') {
      const parsed = Array.isArray(dpt_ids) ? dpt_ids : JSON.parse(dpt_ids || '[]');
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return res.status(400).json({ success: false, message: 'Missing dpt_ids for MULTIPLE audience.' });
      }
      targetDeptIds = parsed;
    } else if (audience === 'GENERAL') {
      // No dept mapping rows needed
      targetDeptIds = [];
    } else {
      return res.status(400).json({ success: false, message: 'Invalid audience value.' });
    }

    // Insert one report
    const [insertResult] = await conn.query(
      `INSERT INTO reports
        (title, writer_names, writer_email, upload_date, keywords, description, location, pages, file_path, audience, notify_candidates)
       VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        writer_names,
        writer_email,
        keywords,
        description,
        location,
        pages,
        req.file.filename,
        audience,                       // SINGLE | MULTIPLE | GENERAL
        notify === 'true' ? 1 : 0,
      ]
    );

    // Immediately after inserting the report
const [[{ report_id: reportId }]] = await conn.query(
  "SELECT report_id FROM reports ORDER BY report_id DESC LIMIT 1"
);


    // Insert join rows for SINGLE/MULTIPLE
    if (audience !== 'GENERAL' && targetDeptIds.length > 0) {
      const values = targetDeptIds.map((id) => [reportId, id]);
      await conn.query(
        'INSERT INTO report_departments (report_id, dpt_id) VALUES ?',
        [values]
      );
    }

    // Email notifications (optional)
    if (notify === 'true') {
      let userRows = [];

      if (audience === 'GENERAL') {
        // Everyone (or all eligible users)
        const [rows] = await conn.query('SELECT name, email FROM users WHERE email IS NOT NULL AND email <> ""');
        userRows = rows;
      } else {
        // Users in selected departments
        // assuming users table has dpt_id FK
        const [rows] = await conn.query(
          'SELECT name, email FROM users WHERE dpt_id IN (?) AND email IS NOT NULL AND email <> ""',
          [targetDeptIds]
        );
        userRows = rows;
      }

      const emails = [...new Set(userRows.map(u => u.email).filter(Boolean))];

      if (emails.length > 0) {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: process.env.EMAIL_USER, // main "to" to satisfy Gmail
          bcc: emails,                // put all recipients in BCC
          subject: 'New Report Uploaded',
          text: `A new report titled "${title}" has been uploaded to the platform.\n\nAudience: ${audience}\n\n— HND Team`,
        });
      }
    }

    return res.json({ success: true, report_id: reportId });
  } catch (err) {
    console.error('Upload report error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
