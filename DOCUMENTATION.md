# Acadex Documentation

This is the canonical documentation for the repository, reconciled with the source tree on 2026-09-24. When a specialized or historical note disagrees with this file or the code, the code and this file win.

## Repository Shape

| Area | Location | Runtime |
| --- | --- | --- |
| Frontend | `src/` | React 18.3.1, React Router 7, Create React App |
| Backend | `hnd_backend/` | Node.js 20, Express 4.18, Mongoose 9 |
| Database | `MONGODB_URI` | MongoDB |
| Storage | AWS S3 when configured | `@aws-sdk/client-s3` |
| Email | `RESEND_API_KEY` | Resend |
| Payments | CamerPay plus optional MoMo service code | CamerPay is the active readiness provider |
| Realtime/video | Socket.IO and LiveKit | Backend/frontend environment configuration |

## Local Development

Prerequisites: Node.js 20, npm, and a reachable MongoDB instance.

```bash
npm install
cd hnd_backend
npm install
npm run dev
```

In a second terminal from the repository root:

```bash
npm start
```

Frontend: `http://localhost:3000`  Backend: `http://localhost:5000`

Backend scripts: `npm run dev`, `npm start`, `npm test` (`smoke:code`), `npm run smoke:integration`, `npm run smoke:payments`, and `npm run test:ci`. Frontend scripts: `npm start`, `npm run build`, and `npm test`.

## Backend Runtime

The entry point is `hnd_backend/server.js`. It loads environment variables, connects to MongoDB, installs security/request middleware, mounts routes, serves `/uploads`, exposes health checks, and starts the optional thumbnail worker.

Mounted API groups:

| Prefix | Responsibility |
| --- | --- |
| `/api/auth` | registration, login, current user, logout, password reset |
| `/api/candidate` | candidate dashboard, profile, materials, history, account and project workflows |
| `/api/admin` | administration, uploads, billing, candidate and presentation management |
| `/api/chat` | rooms, messages, membership, invites, direct-message blocks |
| `/api/ai-tools`, `/api/ai` | AI tools, chat, study sessions |
| `/api/announcements` | candidate and admin announcements |
| `/api/web-search` | authenticated web search |
| `/api/lecturers` | lecturer profiles, bookings and earnings |
| `/api/ads` | authenticated ad management and tracking |
| `/api/material-access` | paid material access and payment status |
| `/api/developer` | developer-only tools and projects |
| `/api/concours` | concours applications and partner workflows |
| `/api/payment`, `/api` | public payment/webhook compatibility routes and the metadata-only `/materials/catalog` endpoint |

The version router provides compatible `/api/v1` paths for supported routes. `GET /api/health` and `/api/v1/health` report database and service readiness; a disconnected database returns HTTP 503. `/` redirects to `https://www.acadexe.com/`.

## Authentication

Mounted route files use `hnd_backend/middlewares/jwtAuth.js`. Login issues access/refresh JWT tokens and the middleware populates `req.user`. `express-session` and a Mongo-backed session store are also configured for compatibility and session-related flows. Documentation describing the backend as session-only is stale.

Main guards are `requireAuth`, `requireAdmin`, `requireDeveloper`, and `requireSelfOrAdmin`. Account status and role checks are enforced by middleware and controllers.

### Authentication Session Lifecycle

The browser uses the HttpOnly `access_token` and `refresh_token` cookies as its authentication source; frontend requests do not send legacy localStorage JWTs. Access cookies last 15 minutes. Candidate refresh cookies are automatically set to 30 days and renewed with a 30-day sliding lifetime; other roles use a one-day refresh-cookie lifetime unless remember-me is explicitly requested. Refresh JWTs default to 30 days (`JWT_REFRESH_EXPIRES_IN` can override this). While an authenticated app tab is visible, the frontend silently refreshes every 10 minutes, refreshes on return to a visible tab, and retries a failed authenticated request once after refresh. A lost/expired refresh token ends the session; the client no longer logs users out solely due to a 72-hour local inactivity timer. The legacy `hnd.sid` Express session has a seven-day cookie but does not define the current JWT login lifetime.

### Candidate Material Visibility

Candidate question papers, reports (including report guides), presentations, and AI Study Mode materials are visible across programs that share the candidate program's configured `visibility_group` in the program catalog. Program tags and department/audience metadata remain displayed as material details, but no longer restrict visibility within that language group. Candidate listings, previews, downloads, thumbnails, saved downloads, and dashboard material summaries use this same language-group scope. AI Study Mode follows the group's configured department tracks (HND or BTS).

## Frontend Navigation

Routes are defined in `src/App.jsx` and grouped into public, candidate, admin, lecturer, developer, and concours-partner workflows. Key families include `/`, `/login`, `/register`, `/reset-password`, `/candidate/*`, `/admin/*`, lecturer routes, payment/study routes, and concours routes.

`/materials` is a public, paginated catalogue of question papers, reports, and presentations. It returns display metadata only; file paths and unrestricted downloads remain protected. Public preview requests return a server-generated PDF containing only the first page. The preview dialog directs visitors to sign in to continue reading or download.

Developer email and push broadcasts are queued as Mongo-backed jobs and can be monitored across frontend route changes. Email broadcasts require `RESEND_WEBHOOK_SECRET` and a Resend webhook configured at `/api/webhooks/resend` for the `email.delivered`, `email.bounced`, `email.failed`, `email.suppressed`, and `email.complained` events. Email success counts mean Resend confirmed delivery to the recipient mail server; pending outcomes remain tracked until a terminal event arrives. Email is submitted in batches of 49 recipients. Push success means accepted by the push service; Web Push does not confirm that a device displayed the notification.

`src/config/api.js` uses the current host on port 5000 for localhost. Deployed builds use `REACT_APP_API_URL`, normalized to end in `/api`; the built-in non-local fallback is only a placeholder and must be replaced.

## Candidate Apparel Ads

Developer-managed ads can use `/referral-tshirt.png` or `/referral-shirt.png` as personalized campaign artwork. Select one in Ads Manager to target candidates and show the ad as a modal; the active-ad API adds only that candidate's name and next referral gift number for rendering over the chest print area. Route targeting, scheduling, frequency limits, close controls, and the modal countdown remain configurable as with other ads. The images are static frontend assets under `public/`.

## Data, Files, and Integrations

Models in `hnd_backend/models/` cover users, departments, academic materials, history, chat, announcements, billing, material access, projects, lecturers, ads, and concours workflows. Uploaded files are served from `/uploads` and may also be stored in S3. Office previews use the conversion queue when available.

Core environment variables are `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `MONGODB_URI`, `JWT_SECRET`, `SESSION_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, CamerPay settings, AWS settings, AI provider keys, and LiveKit settings. Use `hnd_backend/ENV_EXAMPLE.md` for backend placeholders only.

Web Push requires matching `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` on the backend. The public key is provided at runtime by `/api/push/config`, so it does not need to be embedded in the frontend build. Production must use HTTPS. iOS/iPadOS requires Acadex to be installed to the Home Screen for web push support.

`DEBUG_ROUTES_ENABLED` controls development storage test routes. Set it explicitly to `false` in production.

## Deployment

The repository has separate frontend and backend deployment boundaries. Vercel plus a separately deployed `hnd_backend` service is supported, but the source tree does not prove which provider is currently live. Configure the backend service root as `hnd_backend`, set production variables, and verify `/` and `/api/health`.

Before production deployment: rotate exposed credentials; set the real `CORS_ORIGIN`; disable debug routes; confirm MongoDB, S3, Resend, CamerPay, AI, and LiveKit readiness as needed; then test login, a protected endpoint, an upload/download flow, and payment status/webhooks.

## Documentation Inventory

There are **21 Markdown files**: 10 at the repository root and 11 under `docs/` or `hnd_backend/`.

| File | Role |
| --- | --- |
| `README.md` | Entry-point quick start |
| `00_START_HERE.md` | Handoff and deployment pointer |
| `DOCUMENTATION.md` | **Canonical source of truth** |
| `AUDIENCE_FEATURE_SUMMARY.md` | Presentation audience feature note |
| `CAMPAY_MIGRATION.md` | Historical payment migration note |
| `CONCOURS_PARTNER_STYLING.md` | Concours partner UI note |
| `CREDENTIAL_ROTATION_GUIDE.md` | Credential rotation procedure |
| `CUSTOM_ALERT_ENHANCEMENTS.md` | Alert feature note |
| `DEPLOYMENT_AUDIT_VERIFIED_2026-04-28.md` | Historical deployment audit |
| `INTEGRATION_EXAMPLES.md` | Integration examples |
| `PAYGO_MATERIAL_ACCESS_GUIDE.md` | Material access/payment guide |
| `docs/api-reference.md` | Detailed API reference |
| `docs/backend-architecture.md` | Backend architecture detail |
| `docs/frontend-navigation-knowledge-base.md` | Frontend assistant navigation reference |
| `docs/frontend-system-guide.md` | Frontend system detail |
| `docs/HND_PLATFORM_REPORT_CH1_CH5.md` | Product/reporting document |
| `docs/load-test-runbook.md` | Performance runbook |
| `docs/repo-cleanup-plan.md` | Maintenance plan |
| `docs/vercel-render-to-railway-deploy-guide.md` | Provider-specific deployment guide |
| `hnd_backend/ENV_EXAMPLE.md` | Backend environment template |
| `hnd_backend/README.md` | Backend entry-point pointer |

Feature notes and procedures can remain separate, but current architecture, routes, environment, and deployment facts belong here first. The old API/architecture documents contain known stale claims and should be treated as secondary until updated.

## Security Notice

The working-tree backend `.env` contains live-looking database, cloud, payment, AI, email, JWT/session, and push credentials. Treat them as compromised: revoke and replace every exposed credential, update deployment variables, and redeploy. Never put real secret values in Markdown.
