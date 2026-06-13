# PayGo Plan - Material Access & Payment System Documentation

## Overview
This document describes the updated PayGo plan payment system with material access control and the fix for payment-to-access activation issues.

## Problem Statement
Users on PayGo plans were experiencing the following issues:
1. **Low payment amounts**: CamerPay minimum accepted amount is 100 FRS, but the system was charging 50 FRS
2. **Payment success but no access**: When users paid to preview or download materials, payment succeeded but material access was not granted
3. **No access expiration**: Materials should have time-limited access (1 hour) to prevent re-use of single payment

## Solution Architecture

### 1. Payment Amount Updates
Updated payment amounts to meet CamerPay minimum requirements:
- **Question Paper Preview**: 50 FRS → **100 FRS**
- **Question Paper Download**: 100 FRS → **150 FRS**
- **Report Preview**: 50 FRS → **100 FRS**
- **Report Download**: 100 FRS → **150 FRS**
- **Presentation Preview**: 50 FRS → **100 FRS**
- **Presentation Download**: 100 FRS → **150 FRS**

**Configuration File**: `hnd_backend/config/paymentConfig.js`

### 2. Material Access System

#### New Components

**a) MaterialAccess Model** (`hnd_backend/models/MaterialAccess.js`)
- Tracks user access to materials with 1-hour expiration
- Fields:
  - `userId`: User requesting access
  - `materialId`: ID of the material (questionPaperId, reportId, etc.)
  - `materialType`: Type - 'questionPaper', 'report', 'presentation'
  - `accessType`: 'preview' or 'download'
  - `grantedAt`: Timestamp when access was granted
  - `expiresAt`: Timestamp when access expires (1 hour after granted)
  - `paymentTransactionId`: Associated payment transaction

**b) MaterialAccessService** (`hnd_backend/services/materialAccessService.js`)
Core functions for managing material access:
- `grantMaterialAccess()` - Grant 1-hour access after payment
- `hasActiveAccess()` - Check if user has valid access
- `getActiveAccessForMaterial()` - Get access details
- `getRemainingAccessTime()` - Get seconds remaining
- `revokeMaterialAccess()` - Immediately revoke access
- `cleanupExpiredAccesses()` - Cleanup expired records

**c) MaterialAccessMiddleware** (`hnd_backend/middlewares/materialAccessMiddleware.js`)
Express middleware functions:
- `checkMaterialAccess()` - Guard routes, blocks if no access
- `getMaterialAccessInfo()` - Attaches access info without blocking

**d) PaymentCallbackService** (`hnd_backend/services/paymentCallbackService.js`)
Handles payment success/failure and grants access:
- `handlePaymentSuccess()` - Process successful payment and grant material access
- `handlePaymentFailure()` - Update transaction status on failure
- `getPaymentStatus()` - Get payment and access status

**e) MaterialAccessRoutes** (`hnd_backend/Routes/materialAccessRoutes.js`)
API endpoints for material access management:
- `GET /api/material-access/check` - Check if user has access
- `GET /api/material-access/my-accesses` - Get all active accesses for user
- `POST /api/material-access/grant` - Admin endpoint to grant access
- `POST /api/material-access/revoke` - Admin endpoint to revoke access
- `POST /api/material-access/payment-callback` - Payment success callback
- `GET /api/material-access/payment-status/:transactionId` - Get payment status

### 3. Integration Points

#### For Payment Controllers (subscriptionController, etc.)

When payment succeeds, call the callback service:

```javascript
const paymentCallbackService = require('../services/paymentCallbackService');

// After payment completes successfully
const result = await paymentCallbackService.handlePaymentSuccess({
  transactionId: transaction._id,
  userId: req.user._id,
  materialId: req.body.materialId,
  materialType: 'questionPaper', // or 'report', 'presentation'
  accessType: 'preview', // or 'download'
  amount: 100,
  reference: paymentReference,
});
```

#### For Material Download/Preview Routes

Add middleware to check access:

```javascript
const { checkMaterialAccess } = require('../middlewares/materialAccessMiddleware');

// For question paper preview
router.get(
  '/question-papers/:id/preview',
  requireAuth,
  checkMaterialAccess('questionPaper', 'preview'),
  (req, res) => {
    // User has confirmed access
    // Serve preview content
  }
);

// For question paper download
router.get(
  '/question-papers/:id/download',
  requireAuth,
  checkMaterialAccess('questionPaper', 'download'),
  (req, res) => {
    // User has confirmed access
    // Serve download
  }
);
```

### 4. User Role System

The system correctly implements 4 user roles:

| Role | Permissions |
|------|-------------|
| **developer** | Full system access, can promote/demote users to admin |
| **admin** | Administrative access, can manage materials, view analytics |
| **candidate** | Can purchase and access materials |
| **lecturer** | Can create and manage course materials, view student analytics |

**Promotion/Demotion**:
- Only developers can promote users to admin
- Functions: `promoteToAdmin()` and `demoteFromAdmin()` in authController.js
- Access check: Verifies `req.user.role === 'developer'`

### 5. Material Access Flow

```
User Initiates Purchase
        ↓
Payment Processing (CamerPay)
        ↓
Payment Success
        ↓
POST /api/material-access/payment-callback
        ↓
handlePaymentSuccess()
        ↓
MaterialAccess created with 1-hour expiration
        ↓
User can now preview/download material for 1 hour
        ↓
After 1 hour, access automatically expires
```

### 6. Frontend Integration

#### Check if user has access before showing material:

```javascript
// Check access status
const checkMaterialAccess = async (materialId, materialType) => {
  const response = await fetch(
    `/api/material-access/check?materialId=${materialId}&materialType=${materialType}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return response.json();
};

// Get user's active accesses
const getMyAccesses = async () => {
  const response = await fetch('/api/material-access/my-accesses', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.json();
};
```

#### After payment succeeds:

```javascript
// Payment gateway redirects to payment callback
const handlePaymentSuccess = async (paymentData) => {
  const response = await fetch('/api/material-access/payment-callback', {
    method: 'POST',
    body: JSON.stringify({
      transactionId: paymentData.transactionId,
      userId: currentUser._id,
      materialId: selectedMaterial._id,
      materialType: 'questionPaper',
      accessType: 'preview',
      amount: 100,
      reference: paymentData.paymentRef,
    })
  });
  
  const result = await response.json();
  if (result.success) {
    // Show material now
    showMaterialPreview();
  }
};
```

### 7. Database Cleanup

Optional: Run periodic cleanup of expired material accesses:

```javascript
// Schedule this to run daily or weekly
const { cleanupExpiredAccesses } = require('../services/materialAccessService');

// In server.js or a scheduled task:
setInterval(async () => {
  await cleanupExpiredAccesses();
}, 24 * 60 * 60 * 1000); // Daily
```

### 8. Configuration Summary

**File**: `hnd_backend/config/paymentConfig.js`

Use helper functions to get correct amounts:

```javascript
const { getPaymentAmount, getAccessDurationSeconds } = require('../config/paymentConfig');

// Get amount for question paper preview
const amount = getPaymentAmount('QUESTION_PAPER', 'PREVIEW'); // Returns 100

// Get access duration
const duration = getAccessDurationSeconds('PREVIEW'); // Returns 3600 (seconds)
```

### 9. Testing Checklist

- [ ] Payment amount is 100+ FRS (passes CamerPay minimum)
- [ ] MaterialAccess created when payment succeeds
- [ ] User can preview/download for exactly 1 hour
- [ ] Access denied with proper message after 1 hour
- [ ] Admin can manually grant/revoke access
- [ ] Payment status includes access expiration info
- [ ] Database cleanup removes expired accesses
- [ ] Developers can promote/demote users to admin role

### 10. Next Steps

1. **Update existing payment handlers** to call `handlePaymentSuccess()` callback
2. **Add access checks** to question paper, report, and presentation download/preview routes
3. **Update frontend** to check material access and display remaining time
4. **Test end-to-end** payment flow with actual CamerPay integration
5. **Monitor** for issues with access expiration and payment processing

---

**Last Updated**: 2026-06-13
**Status**: Implementation Complete, Awaiting Integration & Testing
