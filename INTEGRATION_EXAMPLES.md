/**
 * INTEGRATION EXAMPLE: How to Update Existing Payment Controllers
 * 
 * This file shows code examples for integrating the new Material Access System
 * into existing payment and material download/preview controllers.
 * 
 * Copy-paste relevant sections into your existing controllers as needed.
 */

// ============================================================================
// EXAMPLE 1: Update Payment Success Handler
// ============================================================================
// Location: candidateQuestionPaperController.js (in the payment completion handler)

const paymentCallbackService = require('../services/paymentCallbackService');

// BEFORE: Just marking payment as complete
router.post('/process-payment-success', async (req, res) => {
  try {
    const { transactionId, materialId } = req.body;
    const transaction = await PaymentTransaction.findByIdAndUpdate(
      transactionId,
      { status: 'completed' }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// AFTER: Grant material access when payment succeeds
router.post('/process-payment-success', async (req, res) => {
  try {
    const { transactionId, materialId, accessType } = req.body;
    const transaction = await PaymentTransaction.findById(transactionId);

    // Call the payment callback service to handle success and grant access
    const result = await paymentCallbackService.handlePaymentSuccess({
      transactionId,
      userId: transaction.userId,
      materialId: materialId,
      materialType: 'questionPaper',
      accessType: accessType || 'preview',
      amount: transaction.amount,
      reference: transaction.paymentRef,
    });

    res.json(result);
  } catch (error) {
    console.error('Payment success handler error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// EXAMPLE 2: Add Access Check to Material Download Route
// ============================================================================
// Location: Any route that serves question papers, reports, presentations

const { checkMaterialAccess } = require('../middlewares/materialAccessMiddleware');
const { requireAuth } = require('../middlewares/authMiddleware');

// BEFORE: No access control
router.get('/question-papers/:id/download', requireAuth, async (req, res) => {
  const paper = await QuestionPaper.findById(req.params.id);
  // ... serve the file
});

// AFTER: Check material access before serving
router.get(
  '/question-papers/:id/download',
  requireAuth,
  checkMaterialAccess('questionPaper', 'download'), // <-- Add this middleware
  async (req, res) => {
    const paper = await QuestionPaper.findById(req.params.id);
    
    // Include access info in response if available
    if (req.materialAccess) {
      res.set('X-Access-Expires', Math.ceil(req.materialAccess.remainingTime));
    }
    
    // ... serve the file
  }
);

// ============================================================================
// EXAMPLE 3: Add Access Check to Preview Route
// ============================================================================

// BEFORE: No access control
router.get('/question-papers/:id/preview', requireAuth, async (req, res) => {
  const paper = await QuestionPaper.findById(req.params.id);
  res.json({ preview: paper.preview });
});

// AFTER: Check access before serving preview
router.get(
  '/question-papers/:id/preview',
  requireAuth,
  checkMaterialAccess('questionPaper', 'preview'), // <-- Add this middleware
  async (req, res) => {
    const paper = await QuestionPaper.findById(req.params.id);
    res.json({
      success: true,
      preview: paper.preview,
      expiresIn: req.materialAccess?.remainingTime,
      expiresAt: req.materialAccess?.expiresAt,
    });
  }
);

// ============================================================================
// EXAMPLE 4: Payment Initiation - Pass Material Info
// ============================================================================
// When initiating payment for a material, include material details

// BEFORE: Payment initiated without material context
router.post('/initiate-payment', requireAuth, async (req, res) => {
  const transaction = await PaymentTransaction.create({
    userId: req.user._id,
    amount: 100,
    type: 'material_access',
  });
  res.json({ transactionId: transaction._id });
});

// AFTER: Include material info in transaction for later access grant
router.post('/initiate-payment', requireAuth, async (req, res) => {
  const { materialId, materialType, accessType } = req.body;
  
  // Import payment config for correct amounts
  const { getPaymentAmount } = require('../config/paymentConfig');
  const amount = getPaymentAmount(materialType, accessType);

  const transaction = await PaymentTransaction.create({
    userId: req.user._id,
    amount: amount,
    type: 'material_access',
    materialId: materialId,        // <-- Add this
    materialType: materialType,    // <-- Add this
    accessType: accessType,        // <-- Add this
    provider: 'campay',
  });

  res.json({
    transactionId: transaction._id,
    amount: amount,
    material: {
      id: materialId,
      type: materialType,
      accessType: accessType,
    },
  });
});

// ============================================================================
// EXAMPLE 5: Report and Presentation Controllers (Same Pattern)
// ============================================================================

// For Reports:
router.get(
  '/reports/:id/download',
  requireAuth,
  checkMaterialAccess('report', 'download'),
  async (req, res) => {
    // Serve report
  }
);

// For Presentations:
router.get(
  '/presentations/:id/download',
  requireAuth,
  checkMaterialAccess('presentation', 'download'),
  async (req, res) => {
    // Serve presentation
  }
);

// ============================================================================
// EXAMPLE 6: Check Access Info in Route Handler (Non-Blocking)
// ============================================================================

const { getMaterialAccessInfo } = require('../middlewares/materialAccessMiddleware');

// Get access info without blocking the request
router.get(
  '/question-papers/:id',
  requireAuth,
  getMaterialAccessInfo('questionPaper'), // <-- Non-blocking check
  async (req, res) => {
    const paper = await QuestionPaper.findById(req.params.id);
    
    // Include access information in response
    res.json({
      paper: paper,
      userAccess: req.materialAccessInfo, // { hasAccess: true/false, remainingTime: -1 or seconds }
    });
  }
);

// ============================================================================
// EXAMPLE 7: PaymentTransaction Model Update (if needed)
// ============================================================================

// Add these fields to PaymentTransaction schema if they don't exist:

const paymentTransactionSchema = new mongoose.Schema({
  // ... existing fields ...
  
  // Material access fields (ADD THESE)
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionPaper', // or 'Report' or 'Presentation'
  },
  materialType: {
    type: String,
    enum: ['questionPaper', 'report', 'presentation'],
  },
  accessType: {
    type: String,
    enum: ['preview', 'download'],
  },
});

// ============================================================================
// EXAMPLE 8: CampAy Webhook Handler (Optional but Recommended)
// ============================================================================
// This is more reliable than status polling

router.post('/webhook/campay', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { status, merchant_invoice_id, payment_id } = body;

    // Verify webhook signature
    const { verifyWebhookSignature } = require('../services/campayPaymentService');
    const isValid = await verifyWebhookSignature(req.body, req.headers['x-campay-signature']);

    if (!isValid) {
      return res.status(401).json({ success: false });
    }

    // Find transaction by merchant_invoice_id
    const transaction = await PaymentTransaction.findOne({
      externalRef: merchant_invoice_id,
    });

    if (!transaction) {
      return res.status(404).json({ success: false });
    }

    // Handle payment success
    if (status === 'successful') {
      await paymentCallbackService.handlePaymentSuccess({
        transactionId: transaction._id,
        userId: transaction.userId,
        materialId: transaction.materialId,
        materialType: transaction.materialType,
        accessType: transaction.accessType,
        amount: transaction.amount,
        reference: payment_id,
      });
    } else if (status === 'failed') {
      await paymentCallbackService.handlePaymentFailure({
        transactionId: transaction._id,
        reason: 'Payment failed in CampAy',
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false });
  }
});

// ============================================================================
// INTEGRATION CHECKLIST
// ============================================================================
/*

Use this checklist to track integration of the new Material Access System:

MODELS:
  [ ] PaymentTransaction schema has materialId, materialType, accessType fields
  [ ] MaterialAccess model created (already done)

SERVICES:
  [ ] materialAccessService imported and available
  [ ] paymentCallbackService imported and used in payment handlers

CONTROLLERS:
  [ ] Payment success handler calls handlePaymentSuccess()
  [ ] Question paper download route uses checkMaterialAccess middleware
  [ ] Question paper preview route uses checkMaterialAccess middleware
  [ ] Report routes updated with access checks
  [ ] Presentation routes updated with access checks
  [ ] Payment initiation passes material info to transaction

ROUTES:
  [ ] Material access routes registered in server.js (already done)
  [ ] Access check endpoints working

FRONTEND:
  [ ] Check access before showing download button
  [ ] Display remaining access time
  [ ] Call material-access endpoints
  [ ] Show error if access expired

TESTING:
  [ ] Payment flow creates material access
  [ ] Access expires after 1 hour
  [ ] Download/preview blocked without access
  [ ] Admin can grant access manually
  [ ] Payment amounts are 100+ FRS (CamerPay minimum)

*/
