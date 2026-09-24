# Acadex

Acadex is a React frontend with a Node.js/Express backend for academic materials, candidate accounts, chat, payments, AI tools, lecturer workflows, and concours workflows.

The maintained documentation is [DOCUMENTATION.md](DOCUMENTATION.md). It contains the current architecture, setup commands, API mount points, environment requirements, deployment checks, and the complete Markdown inventory.

## Quick Start

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

Use [hnd_backend/ENV_EXAMPLE.md](hnd_backend/ENV_EXAMPLE.md) for placeholders only. Never commit or share real `.env` values; rotate credentials exposed in the working tree.
