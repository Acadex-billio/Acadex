const materialAccessService = require('./materialAccessService');
const PaymentTransaction = require('../models/PaymentTransaction');

/**
 * Handle payment success and grant material access
 * @param {Object} paymentData - Payment transaction data
 * @returns {Promise<Object>} Result with access information
 */
async function handlePaymentSuccess(paymentData) {
  try {
    const {
      transactionId,
      userId,
      materialId,
      materialType,
      accessType = 'preview',
      amount,
      reference,
    } = paymentData;

    // Update payment transaction status to completed
    if (transactionId) {
      await PaymentTransaction.findByIdAndUpdate(
        transactionId,
        {
          status: 'completed',
          completedAt: new Date(),
          paymentRef: reference,
        },
        { new: true }
      );
    }

    // Grant material access for 1 hour
    if (userId && materialId && materialType) {
      const access = await materialAccessService.grantMaterialAccess(
        userId,
        materialId,
        materialType,
        accessType,
        transactionId
      );

      return {
        success: true,
        message: `${materialType} ${accessType} access granted for 1 hour`,
        access: {
          granted: true,
          expiresIn: 3600, // seconds
          expiresAt: access.expiresAt,
        },
      };
    }

    return {
      success: true,
      message: 'Payment processed successfully',
    };
  } catch (error) {
    console.error('Error handling payment success:', error);
    throw error;
  }
}

/**
 * Handle payment failure
 * @param {Object} paymentData - Payment transaction data
 * @returns {Promise<Object>} Result
 */
async function handlePaymentFailure(paymentData) {
  try {
    const { transactionId, reason } = paymentData;

    if (transactionId) {
      await PaymentTransaction.findByIdAndUpdate(
        transactionId,
        {
          status: 'failed',
          failedAt: new Date(),
          failureReason: reason,
        },
        { new: true }
      );
    }

    return {
      success: false,
      message: 'Payment failed',
      reason,
    };
  } catch (error) {
    console.error('Error handling payment failure:', error);
    throw error;
  }
}

/**
 * Get payment and access status for a transaction
 * @param {String} transactionId - Transaction ID
 * @returns {Promise<Object>} Payment and access status
 */
async function getPaymentStatus(transactionId) {
  try {
    const transaction = await PaymentTransaction.findById(transactionId);

    if (!transaction) {
      return { success: false, message: 'Transaction not found' };
    }

    // Get material access if applicable
    let materialAccess = null;
    if (transaction.materialId && transaction.materialType) {
      materialAccess = await materialAccessService.getActiveAccessForMaterial(
        transaction.userId,
        transaction.materialId,
        transaction.materialType
      );
    }

    return {
      success: true,
      transaction: {
        id: transaction._id,
        status: transaction.status,
        amount: transaction.amount,
        reference: transaction.paymentRef,
        createdAt: transaction.createdAt,
      },
      materialAccess: materialAccess
        ? {
            granted: true,
            type: materialAccess.materialType,
            accessType: materialAccess.accessType,
            expiresIn: Math.ceil(
              (materialAccess.expiresAt - new Date()) / 1000
            ),
            expiresAt: materialAccess.expiresAt,
          }
        : null,
    };
  } catch (error) {
    console.error('Error fetching payment status:', error);
    throw error;
  }
}

module.exports = {
  handlePaymentSuccess,
  handlePaymentFailure,
  getPaymentStatus,
};
