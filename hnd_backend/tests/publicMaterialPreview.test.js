const assert = require('node:assert/strict');
const test = require('node:test');
const { PDFDocument } = require('pdf-lib');
const { createFirstPagePreview } = require('../services/publicMaterialPreview');

test('public material preview is limited to the first PDF page', async () => {
  const source = await PDFDocument.create();
  source.addPage([612, 792]);
  source.addPage([612, 792]);
  source.addPage([612, 792]);
  const sourceBuffer = Buffer.from(await source.save());

  const preview = await createFirstPagePreview(sourceBuffer, '.pdf', 'papers');
  const result = await PDFDocument.load(preview);

  assert.equal(result.getPageCount(), 1);
});

test('public material preview rejects unsupported file formats', async () => {
  await assert.rejects(
    createFirstPagePreview(Buffer.from('not a PDF'), '.doc', 'papers'),
    { code: 'PREVIEW_FORMAT_UNSUPPORTED' }
  );
});
