# Acadex

Web platform with a React frontend and Node.js/Express backend.

## Project Structure

- Frontend: `./` (React app)
- Backend: `./hnd_backend` (Express API)
- Docs: `./docs` and root-level operational guides

## Quick Start (Local Development)

### 1) Install dependencies

Frontend:

```bash
npm install
```

Backend:

```bash
cd hnd_backend
npm install
```

### 2) Configure environment variables

- Frontend template: `ENV_EXAMPLE.md`
- Backend template: `hnd_backend/ENV_EXAMPLE.md`
- Security and rotation guide: `CREDENTIAL_ROTATION_GUIDE.md`

### 3) Run backend

From workspace root:

```bash
cd hnd_backend
npm run dev
```

Or use the VS Code task: **Start Backend Dev Server**.

### 4) Run frontend

From workspace root:

```bash
npm start
```

Frontend default URL: http://localhost:3000

## Scripts

### Frontend (root)

```bash
npm start
npm run build
npm test
```

### Backend (`hnd_backend`)

```bash
npm run dev
npm start
npm run security-scan
```

## Current Status

- Security hardening and critical fixes were completed (commit: `6ebae5c`).
- Primary remaining work is deployment execution:
	- Rotate exposed credentials.
	- Update Render and Vercel environment variables.
	- Redeploy and run smoke tests.

Start from: `00_START_HERE.md` and `DEPLOYMENT_READINESS.md`.

## Key Operational Docs

- `00_START_HERE.md`
- `FIXES_CHECKLIST.txt`
- `DEPLOYMENT_READINESS.md`
- `CREDENTIAL_ROTATION_GUIDE.md`
- `SECURITY_FIXES_APPLIED.md`

## Deployment Notes

- Backend target: Render
- Frontend target: Vercel
- Validate after deploy:
	- API health endpoint
	- Login flow
	- Logs and error rates
