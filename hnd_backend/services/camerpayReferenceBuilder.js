function buildCamerpayInvoiceReference({ purposeType, purposeCode, resourceType, action, fallbackReference }) {
  const normalizedPurposeType = String(purposeType || '').trim().toLowerCase();
  const normalizedPurposeCode = String(purposeCode || '').trim().toLowerCase();
  const normalizedResourceType = String(resourceType || '').trim().toLowerCase();
  const normalizedAction = String(action || '').trim().toLowerCase();

  if (normalizedPurposeType === 'subscription' || normalizedPurposeCode === 'account_subscription') {
    return '#acadex-account-subscription';
  }

  if (normalizedPurposeType === 'material_access' || normalizedPurposeCode === 'material_access') {
    if (normalizedResourceType === 'report') {
      return normalizedAction === 'preview' ? '#acadex-report-preview' : '#acadex-report-download';
    }
    if (normalizedResourceType === 'presentation') {
      return normalizedAction === 'preview' ? '#acadex-presentation-preview' : '#acadex-presentation-download';
    }
    if (normalizedResourceType === 'question_paper') {
      return normalizedAction === 'preview' ? '#acadex-question-paper-preview' : '#acadex-question-paper-download';
    }
  }

  if (normalizedPurposeType === 'tutorship_booking' || normalizedPurposeCode === 'lecturer_booking_payment') {
    return '#acadex-tutorship-booking';
  }

  if (normalizedPurposeType === 'tutorship_booking' || normalizedPurposeCode === 'lecturer_booking_invite_access') {
    return '#acadex-conference-access';
  }

  return fallbackReference ? String(fallbackReference).trim() : '#acadex-payment';
}

module.exports = { buildCamerpayInvoiceReference };
