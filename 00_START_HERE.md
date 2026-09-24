# Start Here

The current repository documentation is [DOCUMENTATION.md](DOCUMENTATION.md). Start there for verified setup, architecture, route groups, environment variables, deployment checks, and the complete Markdown inventory.

## Immediate Security Action

The working-tree backend `.env` contains credentials that must be treated as compromised. Follow [CREDENTIAL_ROTATION_GUIDE.md](CREDENTIAL_ROTATION_GUIDE.md), revoke every exposed provider credential, update deployment variables, and redeploy before treating the system as production-ready.

## Deployment Smoke Check

After deployment, verify:

1. `GET /api/health` returns a healthy response with database connected.
2. Login creates a valid authenticated session/token.
3. One protected candidate or admin request succeeds.
4. Upload/download and payment callback/status flows work where configured.
