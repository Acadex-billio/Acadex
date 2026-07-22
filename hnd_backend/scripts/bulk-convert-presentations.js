/**
 * Bulk PDF Conversion Script for Presentations
 * Converts all presentations that haven't been converted to PDF yet
 * Usage: node bulk-convert-presentations.js
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Models
const Presentation = require('../models/Presentation');

const PRESENTATION_DIR = path.join(__dirname, '../uploads/presentations');
const PREVIEW_CACHE_DIR = path.join(os.tmpdir(), 'hnd-preview', 'presentations');
const PDF_DIR = path.join(PREVIEW_CACHE_DIR, 'pdfs');

const LO_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'libreoffice',
  'soffice',
];

const COMMAND_CANDIDATES = LO_PATHS.filter((p) => p.includes('\\') ? fs.existsSync(p) : true);

let convertedCount = 0;
let failedCount = 0;
let skippedCount = 0;

// Ensure directories exist
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

const runLibreOfficeConvert = (command, sourcePath, outputDir) =>
  new Promise((resolve, reject) => {
    const args = ['--headless', '--convert-to', 'pdf', sourcePath, '--outdir', outputDir];
    console.log(`[LibreOffice] Starting conversion: ${path.basename(sourcePath)}`);
    const child = spawn(command, args, { windowsHide: true });

    let stderr = '';
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });

    child.on('error', (err) => {
      console.error(`[LibreOffice] Spawn error: ${err.message}`);
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `LibreOffice exited with code ${code}`));
      }
      console.log(`[LibreOffice] Conversion completed: ${path.basename(sourcePath)}`);
      return resolve();
    });
  });

const convertToPdf = async (sourcePath) => {
  let lastError;
  for (const command of COMMAND_CANDIDATES) {
    try {
      await runLibreOfficeConvert(command, sourcePath, PDF_DIR);
      return true;
    } catch (err) {
      lastError = err;
      console.error(`[LibreOffice] Conversion attempt failed with ${command}: ${err.message}`);
    }
  }
  throw lastError || new Error('LibreOffice command not available');
};

const processPresentation = async (presentation) => {
  const filePath = String(presentation.file_path || '').trim();
  if (!filePath) {
    console.log(`[Skip] Presentation ${presentation._id}: No file path`);
    skippedCount++;
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  
  // Skip if already PDF
  if (ext === '.pdf') {
    console.log(`[Skip] Presentation ${presentation._id}: Already PDF`);
    skippedCount++;
    return;
  }

  // Skip if not a presentation file
  if (ext !== '.ppt' && ext !== '.pptx') {
    console.log(`[Skip] Presentation ${presentation._id}: Unsupported format (${ext})`);
    skippedCount++;
    return;
  }

  // Check if PDF already exists
  const basename = path.basename(filePath);
  const pdfName = basename.replace(/\.(ppt|pptx)$/i, '.pdf');
  const pdfPath = path.join(PDF_DIR, pdfName);
  
  if (fs.existsSync(pdfPath)) {
    console.log(`[Skip] Presentation ${presentation._id}: PDF already exists (${pdfName})`);
    skippedCount++;
    return;
  }

  // Determine source path
  let sourcePath;
  if (/^https?:\/\//i.test(filePath)) {
    // Remote file - would need S3 download logic
    console.log(`[Skip] Presentation ${presentation._id}: Remote file (S3) - skipping`);
    skippedCount++;
    return;
  } else {
    // Local file
    sourcePath = path.join(PRESENTATION_DIR, basename);
    if (!fs.existsSync(sourcePath)) {
      console.log(`[Skip] Presentation ${presentation._id}: Source file not found (${sourcePath})`);
      skippedCount++;
      return;
    }
  }

  // Convert to PDF
  try {
    await convertToPdf(sourcePath);
    console.log(`[Success] Presentation ${presentation._id} (${presentation.title}) converted to PDF`);
    convertedCount++;
  } catch (err) {
    console.error(`[Error] Failed to convert presentation ${presentation._id}: ${err.message}`);
    failedCount++;
  }
};

const main = async () => {
  try {
    console.log('[Start] Bulk Presentation PDF Conversion');
    console.log(`[Config] PDF Directory: ${PDF_DIR}`);
    console.log(`[Config] Presentations Directory: ${PRESENTATION_DIR}`);
    
    // Connect to MongoDB
    console.log('[Database] Connecting...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[Database] Connected');

    // Get all presentations
    const presentations = await Presentation.find().lean();
    console.log(`[Database] Found ${presentations.length} presentations`);

    if (presentations.length === 0) {
      console.log('[Info] No presentations to process');
      process.exit(0);
    }

    // Process each presentation
    for (let i = 0; i < presentations.length; i++) {
      console.log(`\n[Progress] ${i + 1}/${presentations.length}`);
      await processPresentation(presentations[i]);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('CONVERSION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Converted:  ${convertedCount}`);
    console.log(`Failed:     ${failedCount}`);
    console.log(`Skipped:    ${skippedCount}`);
    console.log(`Total:      ${presentations.length}`);
    console.log('='.repeat(60));

    process.exit(0);
  } catch (err) {
    console.error('[Fatal Error]', err.message);
    process.exit(1);
  } finally {
    try {
      await mongoose.disconnect();
    } catch (_) {}
  }
};

main();
