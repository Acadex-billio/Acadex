/**
 * PDF to Image Conversion Utility
 * Uses LibreOffice headless to render PDF pages to PNG images
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LO_PATHS = [
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'libreoffice',
  'soffice',
];

const getAvailableCommand = () => {
  for (const cmd of LO_PATHS) {
    if (cmd.includes('\\')) {
      if (fs.existsSync(cmd)) return cmd;
    } else {
      // For non-path commands, just return it (will be found in PATH)
      return cmd;
    }
  }
  return null;
};

/**
 * Render first page of PDF to PNG image using LibreOffice
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputPath - Path where PNG should be saved
 * @param {object} options - Rendering options (currently unused, for compatibility)
 * @returns {Promise<string>} - Path to generated PNG file
 */
const renderPdfFirstPageToPng = async (pdfPath, outputPath, options = {}) => {
  try {
    // Check if PDF exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    const outputDir = path.dirname(outputPath);
    const baseName = path.basename(pdfPath, '.pdf');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const loCommand = getAvailableCommand();
    if (!loCommand) {
      throw new Error('LibreOffice not found in system PATH or standard locations');
    }

    // Convert PDF to PNG using LibreOffice
    await new Promise((resolve, reject) => {
      const args = [
        '--headless',
        '--convert-to', 'png',
        '--outdir', outputDir,
        pdfPath,
      ];

      console.log('[PDF to Image] Converting PDF to PNG:', {
        command: loCommand,
        pdfPath,
        outputDir,
        args,
      });

      const child = spawn(loCommand, args, { windowsHide: true });

      let stderr = '';
      let stdout = '';

      child.stderr.on('data', (buf) => {
        stderr += buf.toString();
      });

      child.stdout.on('data', (buf) => {
        stdout += buf.toString();
      });

      child.on('error', (err) => {
        console.error('[PDF to Image] Spawn error:', {
          command: loCommand,
          message: err.message,
        });
        reject(err);
      });

      child.on('close', (code) => {
        console.log('[PDF to Image] LibreOffice finished:', {
          code,
          stderr: stderr.substring(0, 200),
          stdout: stdout.substring(0, 200),
        });

        if (code !== 0) {
          return reject(new Error(`LibreOffice exited with code ${code}: ${stderr.substring(0, 500)}`));
        }

        // LibreOffice converts /path/to/file.pdf to /path/to/file.png
        const generatedPng = path.join(outputDir, `${baseName}.png`);

        if (!fs.existsSync(generatedPng)) {
          return reject(new Error(`PNG file was not generated at expected location: ${generatedPng}`));
        }

        // Rename to _thumb.png to match expected naming
        const thumbnailPath = outputPath;
        if (generatedPng !== thumbnailPath) {
          fs.renameSync(generatedPng, thumbnailPath);
        }

        console.log('[PDF to Image] Successfully converted PDF to PNG:', {
          pdfPath,
          outputPath: thumbnailPath,
        });

        resolve(thumbnailPath);
      });
    });

    return outputPath;
  } catch (err) {
    console.error('[PDF to Image] Error rendering PDF:', {
      pdfPath,
      message: err.message,
    });
    throw err;
  }
};

module.exports = {
  renderPdfFirstPageToPng,
};
