# Legacy Routes Archive

These route files were moved here because they are not mounted by `hnd_backend/server.js`.

Archived files:
- `AdminRoute.js`
- `CandidateRoute.js`

Why archived:
- Prevent accidental reuse of deprecated route stacks.
- Keep history and rollback path via git.
- Reduce confusion while preserving reference implementation.

Do not import files from this folder in active route mounting.
