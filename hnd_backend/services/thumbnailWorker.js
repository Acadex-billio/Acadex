const { Worker } = require('bullmq');
const path = require('path');
const fs = require('fs');
const { connection } = require('./thumbnailQueue');
const { convertRemotePng } = require('../utils/converterClient');
const { uploadFile } = require('../utils/s3Uploader');

if (!connection) {
  throw new Error('Thumbnail worker cannot start because REDIS_URL or ENABLE_THUMBNAIL_QUEUE is not configured');
}

const worker = new Worker('thumbnailQueue', async (job) => {
  const { pdfPath, thumbnailPath, sourceUrl } = job.data;

  // If thumbnail already exists locally, skip
  if (fs.existsSync(thumbnailPath)) return { ok: true, reason: 'exists' };

  // Try local conversion first
  try {
    const { renderPdfFirstPageToPng } = require('../utils/pdfToImage');
    await renderPdfFirstPageToPng(pdfPath, thumbnailPath);
    // Upload to S3 if configured (use deterministic key)
    if (process.env.AWS_BUCKET_NAME && process.env.AWS_S3_URL) {
      const buffer = fs.readFileSync(thumbnailPath);
      const key = `presentations/thumbnails/${path.basename(thumbnailPath)}`;
      await uploadFile(buffer, path.basename(thumbnailPath), 'image/png', 'presentations/thumbnails', key);
    }
    return { ok: true };
  } catch (err) {
    // Fallback to remote converter PNG
    try {
      await convertRemotePng({ sourcePath: pdfPath, outputDir: path.dirname(thumbnailPath), outputName: path.basename(thumbnailPath) });
      // Upload to S3 if configured (use deterministic key)
      if (process.env.AWS_BUCKET_NAME && process.env.AWS_S3_URL) {
        const buffer = fs.readFileSync(thumbnailPath);
        const key = `presentations/thumbnails/${path.basename(thumbnailPath)}`;
        await uploadFile(buffer, path.basename(thumbnailPath), 'image/png', 'presentations/thumbnails', key);
      }
      return { ok: true, fallback: true };
    } catch (err2) {
      console.error('[ThumbnailWorker] Conversion failed:', err2.message);
      throw err2;
    }
  }
}, { connection });

worker.on('completed', (job) => {
  console.log('[ThumbnailWorker] job completed', job.id);
});
worker.on('failed', (job, err) => {
  console.error('[ThumbnailWorker] job failed', job.id, err.message);
});

module.exports = worker;
