// File: routes/canPresentation.js
const express = require("express");
const router = express.Router();
const db = require("../Database/db");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

// ------------------- CONFIG -------------------
const LO_PATHS = [
  `"C:\\Program Files\\LibreOffice\\program\\soffice.exe"`,
  `"C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"`
];

let sofficeCmd = null;
for (const p of LO_PATHS) {
  if (fs.existsSync(p.replace(/"/g, ""))) {
    sofficeCmd = p;
    break;
  }
}
if (!sofficeCmd) {
  console.warn("LibreOffice not found in standard paths. Falling back to 'soffice' in PATH.");
  sofficeCmd = "soffice";
}

const PRESENTATION_DIR = path.join(__dirname, "../uploads/presentations");
const PDF_DIR = path.join(PRESENTATION_DIR, "pdfs");

// Ensure directories exist
if (!fs.existsSync(PRESENTATION_DIR)) fs.mkdirSync(PRESENTATION_DIR, { recursive: true });
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

// ------------------- ROUTES -------------------

// GET ALL PRESENTATIONS
router.get("/", async (_req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        p.presentation_id,
        p.title AS presentation_title,
        p.presenter_name,
        p.presenter_email,
        p.file_path,
        p.upload_date,
        r.report_id,
        r.title AS report_title
      FROM presentations p
      LEFT JOIN reports r ON p.report_id = r.report_id
      ORDER BY p.presentation_id DESC
    `);

    res.json({ success: true, presentations: rows });
  } catch (err) {
    console.error("[Presentations Error]", err);
    res.status(500).json({ success: false, message: "Failed to retrieve presentations" });
  }
});

// DOWNLOAD PRESENTATION FILE
router.get("/file/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(PRESENTATION_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "File not found" });
  }

  res.download(filePath, filename);
});

// PREVIEW: Convert PPT/PPTX to PDF
router.get("/preview/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Whitelist allowed formats
    const allowedFormats = ['ppt', 'pptx'];
    const ext = path.extname(filename).toLowerCase().slice(1);
    if (!allowedFormats.includes(ext)) {
      return res.status(400).json({ error: 'Unsupported file format' });
    }
    
    const inputPath = path.join(PRESENTATION_DIR, filename);
    
    // Prevent path traversal
    const resolvedInputPath = path.resolve(inputPath);
    if (!resolvedInputPath.startsWith(path.resolve(PRESENTATION_DIR))) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    if (!fs.existsSync(resolvedInputPath)) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    const pdfName = filename.replace(/\.(ppt|pptx)$/i, ".pdf");
    const pdfPath = path.join(PDF_DIR, pdfName);

    // If PDF exists, serve it immediately
    if (fs.existsSync(pdfPath)) return res.sendFile(pdfPath);

    const resolvedPdfDir = path.resolve(PDF_DIR);
    console.log("[LibreOffice] Executing conversion for:", resolvedInputPath);

    execFile(sofficeCmd, ['--headless', '--convert-to', 'pdf', resolvedInputPath, '--outdir', resolvedPdfDir], (err, _stdout, stderr) => {
      if (err) {
        console.error("[LibreOffice Conversion Error]", err, stderr);
        return res.status(500).json({ success: false, message: "Failed to convert presentation to PDF" });
      }

      if (!fs.existsSync(pdfPath)) {
        return res.status(500).json({ success: false, message: "PDF conversion failed" });
      }

      res.sendFile(pdfPath);
    });
  } catch (error) {
    console.error("[Preview Error]", error);
    res.status(500).json({ success: false, message: "Failed to preview presentation" });
  }
});

module.exports = router;
