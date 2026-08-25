const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { uploadFile } = require('../utils/s3Uploader');

const AGREEMENT_VERSION = '1.0';
const LOGIN_URL = 'https://acadexe.com';

async function generateAgreement({ partner, amount, currency, reference }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const write = (text, size = 10, font = regular, color = rgb(0.12, 0.14, 0.18)) => {
    const lines = String(text || '').match(/.{1,92}(?:\s|$)/g) || [''];
    lines.forEach((line) => { if (y < 55) { page = pdf.addPage([595, 842]); y = 790; } page.drawText(line.trim(), { x: 48, y, size, font, color }); y -= size + 6; });
  };
  page.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: rgb(0.03, 0.35, 0.42) });
  page.drawText('ACADEX', { x: 48, y: 815, size: 18, font: bold, color: rgb(1, 1, 1) });
  y = 770;
  write('ACADEX CONCOURS PARTNERSHIP AGREEMENT', 16, bold);
  write(`Partnership reference: ${reference}`);
  write(`Agreement version: ${AGREEMENT_VERSION}    Agreement date: ${new Date().toISOString().slice(0, 10)}`);
  y -= 8;
  write('PARTNER DETAILS', 12, bold);
  write(`Organization: ${partner.organization?.name || partner.name || 'Not provided'}`);
  write(`Contact person: ${partner.organization?.contact_person || partner.name || 'Not provided'}`);
  write(`Email: ${partner.email || 'Not provided'}    Phone: ${partner.phone || 'Not provided'}`);
  write(`Address: ${partner.address || 'Not provided'}`);
  write(`Website: ${partner.organization?.website || 'Not provided'}`);
  y -= 8;
  const sections = [
    ['1. Purpose of the Partnership', 'This agreement authorizes the partner to use the ACADEX Concours Service to publish and manage legitimate academic, professional, or selection opportunities for candidates.'],
    ['2. Scope of Service', 'ACADEX provides a controlled portal for concours publication, dynamic application forms, secure application storage, review workflows, and status communication.'],
    ['3. Partner Responsibilities', 'The partner is responsible for accurate, lawful, current concours information, eligibility criteria, deadlines, contact details, and fair application handling.'],
    ['4. ACADEX Responsibilities', 'ACADEX provides the platform, access controls, application workflow, and reasonable service administration using the configured platform infrastructure.'],
    ['5. Application Management', 'Applications are submitted through ACADEX and may be reviewed, corrected, shortlisted, rejected, or selected through the partner portal.'],
    ['6. Candidate Data and Confidentiality', 'The partner may access only information requested by its application form and must handle candidate information confidentially and only for the stated concours purpose.'],
    ['7. Subscription Fee and Renewal', `The configured partnership fee is ${Number(amount || 0).toFixed(2)} ${currency}. This is a yearly renewable fee. A price greater than zero must be paid and verified before paid partnership activities are activated.`],
    ['8. Activation, Suspension, and Termination', 'The partner cannot publish or manage concours until the partnership is active. ACADEX may suspend or terminate access for non-payment, misuse, inaccurate content, or violation of platform requirements. Historical records are preserved.'],
    ['9. Intellectual Property and Accuracy', 'The partner retains responsibility for content it supplies and confirms that it has authority to publish it. ACADEX branding and software remain ACADEX property.'],
    ['10. Agreement Acceptance', `Using the partner portal after explicit digital acceptance constitutes acceptance of this agreement. Login URL: ${LOGIN_URL}`],
  ];
  sections.forEach(([heading, body]) => { write(heading, 11, bold); write(body); y -= 4; });
  write('By accepting digitally, the partner confirms that the information supplied is accurate and agrees to the conditions above.', 10, bold);
  return Buffer.from(await pdf.save());
}

async function createAndStoreAgreement({ partner, amount, currency }) {
  const reference = `ACP-${String(partner.cand_id).toUpperCase()}-${Date.now()}`;
  const buffer = await generateAgreement({ partner, amount, currency, reference });
  const upload = await uploadFile(buffer, `${reference}.pdf`, 'application/pdf', 'concours-agreements');
  return { version: AGREEMENT_VERSION, reference, buffer, storageKey: upload.key, generatedAt: new Date() };
}

module.exports = { AGREEMENT_VERSION, LOGIN_URL, generateAgreement, createAndStoreAgreement };
