const PayoutBatch = require('../models/PayoutBatch');
const { fetchPayoutBatchStatus } = require('../services/camerpayPayoutService');
const logger = require('../utils/logger');

function normalizeBatchStatus(rawStatus) {
  const status = String(rawStatus || '').trim().toLowerCase();
  if (['completed', 'success', 'successful', 'done', 'settled', 'paid'].includes(status)) return 'completed';
  if (['failed', 'cancelled', 'rejected', 'declined', 'expired'].includes(status)) return 'failed';
  return 'processing';
}

function normalizeBeneficiaryStatus(rawStatus) {
  const status = String(rawStatus || '').trim().toLowerCase();
  if (['completed', 'success', 'successful', 'done', 'settled', 'paid', 'processed'].includes(status)) return 'completed';
  if (['failed', 'cancelled', 'rejected', 'declined', 'expired'].includes(status)) return 'failed';
  return 'pending';
}

function findBeneficiaryMatch(payloadItem, beneficiary) {
  const candidateKeys = [
    payloadItem.external_id,
    payloadItem.external_reference,
    payloadItem.reference,
    payloadItem.id,
    payloadItem.transaction_uuid,
    payloadItem.payment_id,
  ];
  const target = String(beneficiary.external_id || beneficiary.reference || '').trim();
  return candidateKeys.some((key) => String(key || '').trim() === target);
}

async function updateBatchWithProviderResponse(payoutBatch, response) {
  if (!payoutBatch || !response) return payoutBatch;

  payoutBatch.provider_response = response;
  if (Array.isArray(response?.beneficiaries) && response.beneficiaries.length) {
    payoutBatch.beneficiaries = payoutBatch.beneficiaries.map((beneficiary) => {
      const providerRow = response.beneficiaries.find((item) => findBeneficiaryMatch(item, beneficiary));
      const updated = { ...beneficiary };
      if (providerRow) {
        updated.status = normalizeBeneficiaryStatus(providerRow.status || providerRow.result || providerRow.state);
        updated.message = providerRow.message || providerRow.detail || providerRow.reason || beneficiary.message || null;
      }
      return updated;
    });
  }

  const candidateBatchStatus = normalizeBatchStatus(response?.status || response?.batch_status || response?.status_code || response?.state || response?.result);
  if (candidateBatchStatus === 'completed') {
    payoutBatch.status = 'completed';
  } else if (candidateBatchStatus === 'failed') {
    payoutBatch.status = 'failed';
  } else if (payoutBatch.status !== 'pending_approval') {
    payoutBatch.status = 'processing';
  }

  const allCompleted = payoutBatch.beneficiaries.every((b) => b.status === 'completed');
  const anyFailed = payoutBatch.beneficiaries.some((b) => b.status === 'failed');
  if (allCompleted) payoutBatch.status = 'completed';
  else if (anyFailed && payoutBatch.beneficiaries.every((b) => b.status !== 'pending')) payoutBatch.status = 'failed';

  await payoutBatch.save();
  return payoutBatch;
}

exports.listPayoutBatches = async (req, res) => {
  try {
    const query = {};
    if (req.query.type) query.type = String(req.query.type).trim();
    if (req.query.status) query.status = String(req.query.status).trim();
    if (req.query.reference) query.reference = new RegExp(String(req.query.reference).trim(), 'i');

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Number(req.query.limit || 25));
    const skip = (page - 1) * limit;

    const [total, batches] = await Promise.all([
      PayoutBatch.countDocuments(query),
      PayoutBatch.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    return res.json({ success: true, total, page, limit, batches });
  } catch (err) {
    logger.error('PayoutBatch list failed', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Failed to list payout batches.' });
  }
};

exports.getPayoutBatch = async (req, res) => {
  try {
    const batchUuid = String(req.params.batchUuid || '').trim();
    if (!batchUuid) {
      return res.status(400).json({ success: false, message: 'Missing payout batch identifier.' });
    }

    const payoutBatch = await PayoutBatch.findOne({
      $or: [{ batch_uuid: batchUuid }, { reference: batchUuid }, { _id: batchUuid }],
    }).lean();

    if (!payoutBatch) {
      return res.status(404).json({ success: false, message: 'Payout batch not found.' });
    }

    return res.json({ success: true, payoutBatch });
  } catch (err) {
    logger.error('PayoutBatch get failed', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Failed to load payout batch.' });
  }
};

exports.refreshPayoutBatchStatus = async (req, res) => {
  try {
    const batchUuid = String(req.params.batchUuid || '').trim();
    if (!batchUuid) {
      return res.status(400).json({ success: false, message: 'Missing payout batch identifier.' });
    }

    const payoutBatch = await PayoutBatch.findOne({ batch_uuid: batchUuid });
    if (!payoutBatch) {
      return res.status(404).json({ success: false, message: 'Payout batch not found.' });
    }

    const statusResponse = await fetchPayoutBatchStatus(payoutBatch.batch_uuid);
    const updatedBatch = await updateBatchWithProviderResponse(payoutBatch, statusResponse);

    return res.json({ success: true, payoutBatch: updatedBatch });
  } catch (err) {
    logger.error('PayoutBatch refresh failed', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Failed to refresh payout batch status.' });
  }
};
