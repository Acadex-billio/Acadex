const { PDFDocument } = require('pdf-lib');

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

module.exports = {
  streamToBuffer,
  subsetPdfBuffer,
};