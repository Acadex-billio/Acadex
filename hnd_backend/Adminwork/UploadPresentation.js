const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../Database/db');
const nodemailer = require('nodemailer');

// -------------------- Upload directory --------------------
const pptDir = path.join(__dirname, '../uploads/presentations');
if (!fs.existsSync(pptDir)) fs.mkdirSync(pptDir, { recursive: true });

// -------------------- Multer storage --------------------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, pptDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// -------------------- Nodemailer transporter --------------------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// -------------------- GET reports for dropdown --------------------
router.get('/reports', async (_req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT r.report_id, r.title, r.writer_names, r.writer_email, r.upload_date,
              GROUP_CONCAT(d.department_name) AS departments
       FROM reports r
       LEFT JOIN report_departments rd ON r.report_id = rd.report_id
       LEFT JOIN dpts d ON rd.dpt_id = d.dpt_id
       GROUP BY r.report_id
       ORDER BY r.upload_date DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Fetch reports error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch reports' });
  }
});

// -------------------- POST upload presentation --------------------
router.post('/upload-presentation', upload.single('presentationFile'), async (req, res) => {
  try {
    const { report_id, title, presenter_name, presenter_email, notify } = req.body;

    // Validate required fields
    if (!title || !presenter_name || !presenter_email || !req.file) {
      return res.status(400).json({ success: false, message: 'Missing required fields or file.' });
    }

    // Insert into presentations table
    const sql = `
      INSERT INTO presentations (report_id, title, presenter_name, presenter_email, file_path)
      VALUES (?, ?, ?, ?, ?)
    `;
    const values = [report_id || null, title, presenter_name, presenter_email, req.file.filename];

    const [result] = await db.promise().query(sql, values);

    // Fetch the inserted presentation_id (trigger-generated)
    const [[{ presentation_id }]] = await db.promise().query(
      'SELECT presentation_id FROM presentations ORDER BY upload_date DESC LIMIT 1'
    );

    // Send notification emails if requested
    if (notify === 'true') {
      try {
        const [users] = await db.promise().query('SELECT email FROM users WHERE email IS NOT NULL AND email <> ""');
        const emailList = users.map(u => u.email);

        if (emailList.length > 0) {
          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, // required by Gmail
            bcc: emailList,
            subject: `New Presentation Uploaded: ${title}`,
            text: `A new presentation titled "${title}" has been uploaded.\n\nPresenter: ${presenter_name}\nEmail: ${presenter_email}\n\nAccess the Acadex to view/download.`,
          });
        }
      } catch (mailErr) {
        console.error('Email sending error:', mailErr);
      }
    }

    res.status(200).json({ success: true, message: 'Presentation uploaded successfully', presentation_id });
  } catch (error) {
    console.error('Upload presentation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
