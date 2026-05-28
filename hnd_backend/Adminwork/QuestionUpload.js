// File: routes/questionPapers.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const db = require('../Database/db'); // mysql2 instance

/** -------------------- Uploads setup -------------------- */
const papersDir = path.join(__dirname, '../uploads/papers');
if (!fs.existsSync(papersDir)) fs.mkdirSync(papersDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, papersDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

/** -------------------- Mailer -------------------- */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

/** -------------------- Helpers -------------------- */
const AUDIENCE = new Set(['GENERAL', 'SINGLE', 'MULTIPLE']);

function coerceMoreInfo({ more_info, study_links }) {
  // Accept modern string or legacy array
  if (typeof more_info === 'string' && more_info.trim()) return more_info.trim();

  if (typeof study_links === 'string') {
    try {
      const arr = JSON.parse(study_links);
      if (Array.isArray(arr)) {
        return arr
          .map((s) => (typeof s === 'string' ? s.trim() : ''))
          .filter(Boolean)
          .join(', ');
      }
    } catch {
      // ignore parse errors
    }
  }
  return '';
}

function parseDptIds(maybeJsonOrArray) {
  if (!maybeJsonOrArray) return [];
  if (Array.isArray(maybeJsonOrArray)) return maybeJsonOrArray.filter(Boolean);

  try {
    const parsed = JSON.parse(maybeJsonOrArray);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** -------------------- Routes -------------------- */

/** GET /api/admin/departments */
router.get('/departments', async (_req, res) => {
  try {
    const [rows] = await db.promise().query(
      'SELECT dpt_id, department_name FROM dpts ORDER BY department_name ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Departments fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch departments' });
  }
});

router.post('/upload-paper', upload.single('paperFile'), async (req, res) => {
  const conn = db.promise();

  try {
    const {
      audience,
      dpt_id,
      dpt_ids,
      paperTitle,
      hndYear,
      uploaded_by,
      notify
    } = req.body;
    const file = req.file;

    // Basic validation
    const aud = String(audience || '').toUpperCase();
    if (!AUDIENCE.has(aud)) {
      return res.status(400).json({ success: false, message: 'Invalid audience.' });
    }
    if (!paperTitle || !hndYear || !uploaded_by || !file) {
      return res.status(400).json({ success: false, message: 'Missing required fields or file.' });
    }

    // Target departments
    let targetDeptIds = [];
    if (aud === 'SINGLE') {
      if (!dpt_id) {
        return res.status(400).json({ success: false, message: 'dpt_id is required for SINGLE audience' });
      }
      targetDeptIds = [dpt_id];
    } else if (aud === 'MULTIPLE') {
      const parsed = parseDptIds(dpt_ids);
      if (parsed.length === 0) {
        return res.status(400).json({ success: false, message: 'dpt_ids must contain at least one department for MULTIPLE audience' });
      }
      targetDeptIds = parsed;
    } else if (aud === 'GENERAL') {
      // No department mapping rows required; audience == GLOBAL
      targetDeptIds = [];
    }

    // Coerce more_info
    const moreInfo = coerceMoreInfo(req.body); // single string, max length should match DB column

    // Insert question_papers
    const [insertPaper] = await conn.query(
      `INSERT INTO question_papers
       (upload_date, course_title, hnd_year, paper_file, uploaded_by, audience, more_info)
       VALUES (NOW(), ?, ?, ?, ?, ?, ?)`,
      [paperTitle.trim(), String(hndYear).trim(), file.filename, uploaded_by.trim(), aud, moreInfo]
    );

    const [[{ qp_id: qpId }]] = await conn.query(
      "SELECT qp_id FROM question_papers ORDER BY qp_id DESC LIMIT 1"
    );
    
    // Bridge rows (only for SINGLE/MULTIPLE)
    if (targetDeptIds.length > 0) {
      const values = targetDeptIds.map((id) => [qpId, id]);
      await conn.query(
        'INSERT INTO question_paper_departments (qp_id, dpt_id) VALUES ?',
        [values]
      );
    }

    // Notifications
    const shouldNotify = String(notify || '').toLowerCase() === 'true';
    let emailReport = { attempted: 0, sent: 0, failed: 0 };

    if (shouldNotify) {
      let users = [];

      if (aud === 'GENERAL') {
        const [rows] = await conn.query(
          `SELECT u.name, u.email, u.dpt_id, d.department_name
           FROM users u
           JOIN dpts d ON d.dpt_id = u.dpt_id
           WHERE u.email IS NOT NULL AND u.email <> ''`
        );
        users = rows;
      } else {
        // SINGLE/MULTIPLE — restrict by dpt_id set
        if (targetDeptIds.length) {
          const placeholders = targetDeptIds.map(() => '?').join(',');
          const [rows] = await conn.query(
            `SELECT u.name, u.email, u.dpt_id, d.department_name
             FROM users u
             JOIN dpts d ON d.dpt_id = u.dpt_id
             WHERE u.email IS NOT NULL AND u.email <> '' AND u.dpt_id IN (${placeholders})`,
            targetDeptIds
          );
          users = rows;
        }
      }

      emailReport.attempted = users.length;

      if (users.length > 0) {
        // Send in small batches via BCC to reduce SMTP calls
        const subject = `New Question Paper: ${paperTitle}`;
        const textBase =
`A new HND question paper titled "${paperTitle}" has been uploaded.

HND Year: ${hndYear}
Uploaded by: ${uploaded_by}

Log in to the Acadex to access and download it.

Best regards,
Acadex Team`;

        // chunk into groups of e.g. 40
        const chunkSize = 40;
        for (let i = 0; i < users.length; i += chunkSize) {
          const chunk = users.slice(i, i + chunkSize);
          const bccList = chunk.map((u) => u.email).join(', ');
          try {
            await transporter.sendMail({
              from: process.env.EMAIL_USER,
              to: process.env.EMAIL_USER,   // primary TO (self); real recipients in BCC
              bcc: bccList,
              subject,
              text: textBase
            });
            emailReport.sent += chunk.length;
          } catch (mailErr) {
            emailReport.failed += chunk.length;
            console.error('Email batch error:', mailErr?.message || mailErr);
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Question paper uploaded successfully.',
      qp_id: qpId,
      emailReport
    });
  } catch (err) {
    console.error('upload-paper error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }uu
});

module.exports = router;
