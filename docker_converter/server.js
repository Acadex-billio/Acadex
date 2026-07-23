const express = require('express');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json({ limit: '200mb' }));

const PORT = Number(process.env.PORT || 8080);
const SHARED_SECRETS = Array.from(new Set(
  [
    process.env.CONVERTER_SECRET,
    process.env.CONVERTER_SHARED_SECRET,
    process.env.CONVERTER_SECRET_FALLBACK,
    'TheBillions11',
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
));
const CONVERSION_DIR = path.join(__dirname, 'tmp');

if (!fs.existsSync(CONVERSION_DIR)) {
  fs.mkdirSync(CONVERSION_DIR, { recursive: true });
}

const requireSecret = (req, res, next) => {
  const header = String(req.headers['x-converter-secret'] || '').trim();
  if (SHARED_SECRETS.length === 0 || !SHARED_SECRETS.includes(header)) {
    return res.status(401).json({ success: false, message: 'Unauthorized converter request' });
  }
  next();
};

const runCommand = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true });
  let stderr = '';
  let stdout = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (err) => reject(err));
  child.on('close', (code) => {
    if (code !== 0) {
      return reject(new Error(stderr || `Command exited with code ${code}`));
    }
    resolve({ stdout, stderr });
  });
});

const ensureSourceFile = async (sourcePath, sourceUrl, workDir, sourceBase64, sourceFilename) => {
  if (sourceBase64) {
    const safeName = String(sourceFilename || path.basename(sourceUrl || 'source') || 'source')
      .replace(/[\\/]+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const downloadPath = path.join(workDir, `source-${Date.now()}-${safeName}`);
    fs.writeFileSync(downloadPath, Buffer.from(sourceBase64, 'base64'));
    return downloadPath;
  }

  if (sourcePath && fs.existsSync(sourcePath)) {
    return sourcePath;
  }

  if (!sourceUrl) {
    throw new Error('Either sourcePath, sourceBase64, or sourceUrl must be provided');
  }

  const downloadPath = path.join(workDir, `source-${Date.now()}-${path.basename(sourceUrl) || 'download'}`);
  await runCommand('curl', ['-L', '--fail', '-o', downloadPath, sourceUrl]);

  if (!fs.existsSync(downloadPath)) {
    throw new Error('Downloaded source file was not created');
  }

  return downloadPath;
};

const resolveLibreOfficeCommand = () => {
  const candidates = [
    process.env.LIBREOFFICE_PATH,
    '/usr/bin/soffice',
    '/usr/bin/soffice.bin',
    '/usr/bin/libreoffice',
    '/usr/lib/libreoffice/program/soffice',
    '/usr/lib/libreoffice/program/soffice.bin',
    '/usr/lib/libreoffice/program/libreoffice',
    'soffice',
    'libreoffice',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }

    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [candidate], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status === 0 && String(result.stdout || '').trim()) {
      return candidate;
    }
  }

  return null;
};

const convertToPdf = async (sourcePath, outputDir) => {
  const sourceName = path.basename(sourcePath);
  const outputPath = path.join(outputDir, sourceName.replace(/\.(ppt|pptx)$/i, '.pdf'));
  const command = resolveLibreOfficeCommand();

  if (!command) {
    throw new Error('LibreOffice executable was not found in the converter container');
  }

  console.log(`[docker-converter] Resolved LibreOffice command: ${command}`);

  await runCommand(command, [
    '--headless',
    '--convert-to', 'pdf',
    sourcePath,
    '--outdir', outputDir,
  ]);

  if (!fs.existsSync(outputPath)) {
    const tempOutputPath = path.join(outputDir, sourceName.replace(/\.(ppt|pptx)$/i, '_temp.pdf'));
    if (fs.existsSync(tempOutputPath)) {
      fs.renameSync(tempOutputPath, outputPath);
    }
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error('Converted PDF was not produced');
  }

  return outputPath;
};

const convertPdfToPng = async (pdfPath, outputDir) => {
  const pdfName = path.basename(pdfPath, path.extname(pdfPath));
  const outputPath = path.join(outputDir, `${pdfName}.png`);
  const command = resolveLibreOfficeCommand();

  if (!command) {
    throw new Error('LibreOffice executable was not found in the converter container');
  }

  console.log(`[docker-converter] Resolved LibreOffice command: ${command}`);

  await runCommand(command, [
    '--headless',
    '--convert-to', 'png',
    '--outdir', outputDir,
    pdfPath,
  ]);

  if (!fs.existsSync(outputPath)) {
    throw new Error('Converted PNG was not produced');
  }

  return outputPath;
};

app.get('/health', (req, res) => {
  res.json({ success: true, service: 'docker-converter', ok: true });
});

app.post('/convert/pdf', requireSecret, async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    const { sourcePath, sourceUrl, outputName, sourceBase64, sourceFilename } = req.body || {};
    console.log(`[docker-converter:${requestId}] PDF conversion requested:`, {
      sourceUrl,
      outputName,
      hasSourceBase64: Boolean(sourceBase64),
      sourceFilename,
    });
    const workDir = path.join(CONVERSION_DIR, requestId);
    fs.mkdirSync(workDir, { recursive: true });

    const resolvedSourcePath = await ensureSourceFile(sourcePath, sourceUrl, workDir, sourceBase64, sourceFilename);
    console.log(`[docker-converter:${requestId}] Source file resolved:`, resolvedSourcePath);
    
    const safeName = outputName || path.basename(resolvedSourcePath);
    const outputPath = await convertToPdf(resolvedSourcePath, workDir);
    console.log(`[docker-converter:${requestId}] PDF conversion completed:`, outputPath);
    
    const fileBuffer = fs.readFileSync(outputPath);
    console.log(`[docker-converter:${requestId}] PDF buffer size:`, fileBuffer.length, 'bytes');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${safeName.replace(/\.[^.]+$/, '.pdf')}"`);  
    return res.send(fileBuffer);
  } catch (err) {
    console.error(`[docker-converter:${requestId}] PDF conversion failed:`, err.message);
    return res.status(500).json({ success: false, message: err.message || 'PDF conversion failed' });
  }
});

app.post('/convert/png', requireSecret, async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    const { sourcePath, sourceUrl, outputName, sourceBase64, sourceFilename } = req.body || {};
    console.log(`[docker-converter:${requestId}] PNG conversion requested:`, {
      sourceUrl,
      outputName,
      hasSourceBase64: Boolean(sourceBase64),
      sourceFilename,
    });
    const workDir = path.join(CONVERSION_DIR, requestId);
    fs.mkdirSync(workDir, { recursive: true });

    const resolvedSourcePath = await ensureSourceFile(sourcePath, sourceUrl, workDir, sourceBase64, sourceFilename);
    console.log(`[docker-converter:${requestId}] Source file resolved:`, resolvedSourcePath);
    
    const safeName = outputName || path.basename(resolvedSourcePath);
    const outputPath = await convertPdfToPng(resolvedSourcePath, workDir);
    console.log(`[docker-converter:${requestId}] PNG conversion completed:`, outputPath);
    
    const fileBuffer = fs.readFileSync(outputPath);
    console.log(`[docker-converter:${requestId}] PNG buffer size:`, fileBuffer.length, 'bytes');

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${safeName.replace(/\.[^.]+$/, '.png')}"`);
    return res.send(fileBuffer);
  } catch (err) {
    console.error(`[docker-converter:${requestId}] PNG conversion failed:`, err.message);
    return res.status(500).json({ success: false, message: err.message || 'PNG conversion failed' });
  }
});

app.listen(PORT, () => {
  console.log(`[docker-converter] listening on ${PORT}`);
});
