const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function subsetPdfBuffer(inputBuffer, maxPages) {
  if (!maxPages || maxPages < 1) return inputBuffer;
  const src = await PDFDocument.load(inputBuffer, { ignoreEncryption: true });
  const totalPages = src.getPageCount();
  const pageIndexes = Array.from({ length: Math.min(maxPages, totalPages) }, (_, index) => index);
  const out = await PDFDocument.create();
  const copiedPages = await out.copyPages(src, pageIndexes);
  copiedPages.forEach((page) => out.addPage(page));
  return Buffer.from(await out.save());
}

async function applyPdfWatermark(inputBuffer, options = {}) {
  if (!inputBuffer || inputBuffer.length === 0) return inputBuffer;

  const pdfDoc = await PDFDocument.load(inputBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  const watermarkText = String(options.text || 'ACADEX').trim() || 'ACADEX';
  const opacity = Number.isFinite(options.opacity) ? options.opacity : 0.14;
  const textSize = Number.isFinite(options.textSize) ? options.textSize : 48;

  const logoPath = options.logoPath || path.resolve(__dirname, '../../public/logo192.png');
  let logoImage = null;
  try {
    if (fs.existsSync(logoPath)) {
      const logoBytes = await fs.promises.readFile(logoPath);
      logoImage = await pdfDoc.embedPng(logoBytes);
    }
  } catch (err) {
    console.warn('[pdfAccess] Failed to embed watermark logo:', err.message);
  }

  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(watermarkText, textSize);
    page.drawText(watermarkText, {
      x: width / 2 - textWidth / 2,
      y: height / 2,
      size: textSize,
      font,
      color: rgb(0.12, 0.14, 0.18),
      opacity,
      rotate: degrees(-30),
    });

    if (logoImage) {
      const logoWidth = Math.min(width * 0.24, 120);
      const logoHeight = logoWidth * 0.6;
      page.drawImage(logoImage, {
        x: width / 2 - logoWidth / 2,
        y: height / 2 - logoHeight / 2 - 90,
        width: logoWidth,
        height: logoHeight,
        opacity: opacity * 1.2,
      });
    }
  });

  return Buffer.from(await pdfDoc.save());
}

module.exports = {
  streamToBuffer,
  subsetPdfBuffer,
  applyPdfWatermark,
};