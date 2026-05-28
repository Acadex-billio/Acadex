# Deployment Audit (Verified)

Date: 2026-04-28
Scope: End-to-end verification of mounted backend routes, frontend route wiring, admin upload flows, payment flow, and production risks.

## Corrections to Previous Audit

These previous findings were incorrect and are now corrected:

1. "Admin material upload UI missing" -> FALSE
- Admin upload pages exist in frontend routes:
  - src/App.jsx:124 (reports)
  - src/App.jsx:125 (presentations)
  - src/App.jsx:126 (question papers)
- Components exist and are implemented:
  - src/components/ReportUpload.jsx
  - src/components/UploadPresentation.jsx
  - src/components/QuestionUpload.jsx

2. "Payment integration incomplete" -> FALSE
- Candidate payment endpoints are mounted:
  - hnd_backend/Routes/candidateRoutes.js:69-80
- Subscription/material checkout and status polling are implemented:
  - hnd_backend/controllers/subscriptionController.js
- MoMo provider service exists and is integrated:
  - hnd_backend/services/momoCollectionService.js
- Frontend payment UI is integrated:
  - src/components/CandidateSubscriptions.jsx
  - src/components/PaymentActionModal.jsx
  - src/components/QuestionPapers.jsx
  - src/components/ViewReports.jsx
  - src/components/ViewPresentation.jsx

3. "Duplicate route files cause active conflicts" -> OVERSTATED
- Duplicate legacy files exist:
  - hnd_backend/Routes/AdminRoute.js
  - hnd_backend/Routes/CandidateRoute.js
- But server mounts lowercase route files only:
  - hnd_backend/server.js:247-257
- Result: these duplicates are mostly maintenance debt, not active runtime conflicts.

## Verified System Capabilities (Present)

1. Admin + candidate shells and routing
- Frontend route map is extensive and correctly wired:
  - src/App.jsx

2. Admin uploads (all 3 material types)
- Backend upload endpoints exist and are protected by auth/admin middleware:
  - hnd_backend/Routes/adminRoutes.js
- Controllers implemented:
  - hnd_backend/controllers/questionPaperController.js
  - hnd_backend/controllers/adminReportController.js
  - hnd_backend/controllers/adminPresentationController.js

3. Candidate paid access flow
- Plan checkout + material checkout + center checkout + status polling implemented:
  - hnd_backend/controllers/subscriptionController.js

4. Email and push notification capabilities
- Resend-based email service exists:
  - hnd_backend/services/emailService.js
- Upload controllers call notify flows:
  - hnd_backend/controllers/adminReportController.js
  - hnd_backend/controllers/adminPresentationController.js
  - hnd_backend/controllers/questionPaperController.js

5. Production guard for S3 test routes
- S3 test routes are now dev-only mounted:
  - hnd_backend/server.js:260-263

## Actual High-Risk Findings (Evidence-Backed)

### CRITICAL-1: Tracked environment secret files in git
Risk:
- Sensitive secrets can be exposed in repository history and local clones.

Evidence:
- Tracked files include:
  - .env
  - hnd_backend/.env
- Verified via git ls-files.

Required action:
- Remove tracked .env files from git index.
- Rotate all exposed credentials immediately (JWT/session secrets, DB URI, S3, payment, email, AI keys).

### CRITICAL-2: Payment service defaults to mock mode + auto success if not configured
Risk:
- Misconfigured production can grant paid access without real payment.

Evidence:
- Default provider mode fallback:
  - hnd_backend/services/momoCollectionService.js:3 (MOMO_PROVIDER defaults to mock)
- Auto-success default:
  - hnd_backend/services/momoCollectionService.js:11 (MOMO_MOCK_AUTO_SUCCESS defaults true)
- Mock path returns successful status:
  - hnd_backend/services/momoCollectionService.js:82-90 and 142-148

Required action:
- Enforce fail-fast on startup in production if MOMO_PROVIDER/mock settings are unsafe.
- Block startup when provider credentials are missing in production.

### HIGH-1: File size policy mismatch (confusing operational behavior)
Risk:
- Admin routes appear to allow 20MB/25MB but middleware hard-rejects >15MB.

Evidence:
- Multer route limits:
  - hnd_backend/Routes/adminRoutes.js:48 (20MB reports)
  - hnd_backend/Routes/adminRoutes.js:53 (25MB presentations)
- Global document validator max:
  - hnd_backend/middlewares/uploadValidation.js:23 (15MB)

Required action:
- Align limits by type or make middleware type-aware to avoid false expectations.

### HIGH-2: Route/auth implementation split across old and new auth middleware modules
Risk:
- Inconsistent auth behavior surface and higher maintenance risk.

Evidence:
- authRoutes uses utils/jwtUtils requireAuth:
  - hnd_backend/Routes/authRoutes.js:5
- candidate/admin routes use middlewares/jwtAuth:
  - hnd_backend/Routes/candidateRoutes.js:16
  - hnd_backend/Routes/adminRoutes.js:14

Required action:
- Standardize on one auth middleware path and deprecate the other.

### MEDIUM-1: Legacy route files still present (dead/legacy code)
Risk:
- Confusion, accidental future import/use, harder incident response.

Evidence:
- Legacy route aggregators:
  - hnd_backend/Routes/AdminRoute.js
  - hnd_backend/Routes/CandidateRoute.js
- Not mounted by server currently.

Required action:
- Archive/remove legacy files after confirming no external dependency.

## Deployment Decision

Current status: CONDITIONAL GO

You can move toward real uploads if and only if:
1. You resolve CRITICAL-1 and CRITICAL-2 first.
2. You verify payment provider environment values in deployment platform.
3. You run one end-to-end paid action test in production-like env (sandbox or live, but non-mock path).

## Minimal Immediate Fix Plan

1. Secrets and repo hygiene
- Remove tracked env files from git index and add proper ignore patterns.
- Rotate all possibly exposed credentials.

2. Payment safety guard
- Add startup check in server boot:
  - In production, reject MOMO_PROVIDER=mock.
  - In production, reject missing MOMO_API_USER/MOMO_API_KEY/MOMO_SUBSCRIPTION_KEY.

3. Upload limits consistency
- Harmonize multer and validation middleware limits.

4. Cleanup debt
- Deprecate/remove legacy route files and unify auth middleware imports.

