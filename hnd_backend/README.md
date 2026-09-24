# Acadex Backend

The backend documentation is maintained in the repository root: [../DOCUMENTATION.md](../DOCUMENTATION.md). This file is a short entry point; route and environment facts should be updated in the canonical document first.

## Quick Start

Prerequisites: Node.js 20.x, npm, and MongoDB.

```bash
npm install
npm run dev
```

Use [ENV_EXAMPLE.md](ENV_EXAMPLE.md) for placeholder configuration. Authentication uses JWT middleware with session compatibility; email uses `RESEND_API_KEY`, not the old Gmail-only setup.
