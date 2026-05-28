const express = require("express");
const router = express.Router();
const db = require("../Database/db");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

// Directories
const REPORT_DIR = path.join(__dirname, "../uploads/reports");
const PDF_DIR = path.join(REPORT_DIR, "pdfs");
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

// LibreOffice paths (Windows)
const LO_PATHS = [
  `"C:\\Program Files\\LibreOffice\\program\\soffice.exe"`,
  `"C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"`
];
let sofficeCmd = LO_PATHS.find(p => fs.existsSync(p.replace(/"/g, ""))) || "soffice";

// -----------------------------
// GET ALL REPORTS
// URL: GET /api/candidate/reports
// -----------------------------
router.get("/", async (_req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT report_id, title, writer_names, writer_email,
             upload_date, keywords, description, location, pages, file_path
      FROM reports
      ORDER BY report_id DESC
    `);
    return res.json({ reports: rows });
  } catch (err) {
    console.error("[ViewReport GET /] error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch reports" });
  }
});

// -----------------------------
// DOWNLOAD REPORT FILE
// URL: GET /api/candidate/reports/file/:filename
// -----------------------------
router.get("/file/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(REPORT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "File not found" });
  }
  res.download(filePath, filename);
});

// -----------------------------
// PREVIEW REPORT (DOC/DOCX -> PDF)
// URL: GET /api/candidate/reports/preview/:filename
// -----------------------------
router.get("/preview/:filename", (req, res) => {
  const { filename } = req.params;
  
  // Whitelist allowed formats
  const allowedFormats = ['doc', 'docx'];
  const ext = path.extname(filename).toLowerCase().slice(1);
  if (!allowedFormats.includes(ext) && ext !== 'pdf') {
    return res.status(400).json({ error: 'Unsupported file format' });
  }
  
  const inputPath = path.join(REPORT_DIR, filename);
  
  // Prevent path traversal
  const resolvedInputPath = path.resolve(inputPath);
  if (!resolvedInputPath.startsWith(path.resolve(REPORT_DIR))) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  if (!fs.existsSync(resolvedInputPath)) {
    return res.status(404).json({ success: false, message: "File not found" });
  }

  if (ext === "pdf") return res.sendFile(resolvedInputPath);

  // Convert Word to PDF
  const pdfName = filename.replace(/\.(doc|docx)$/i, ".pdf");
  const pdfPath = path.join(PDF_DIR, pdfName);

  if (fs.existsSync(pdfPath)) return res.sendFile(pdfPath);

  console.log("[LibreOffice] Converting file to PDF");

  // Use spawn with resolved paths
  const proc = spawn(sofficeCmd, [
    '--headless',
    '--convert-to', 'pdf',
    resolvedInputPath,
    '--outdir', path.resolve(PDF_DIR)
  ], { windowsHide: true, shell: false });

  let errorOutput = '';

  proc.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error("[LibreOffice conversion error] Exit code:", code, errorOutput);
      return res.status(500).json({ success: false, message: "Failed to convert report to PDF" });
    }
    if (!fs.existsSync(pdfPath)) {
      console.error("[LibreOffice] PDF file not created at:", pdfPath);
      return res.status(500).json({ success: false, message: "PDF conversion failed" });
    }
    return res.sendFile(pdfPath);
  });

  proc.on('error', (err) => {
    console.error("[LibreOffice spawn error]", err);
    return res.status(500).json({ success: false, message: "Failed to start PDF conversion" });
  });
});

module.exports = router;
