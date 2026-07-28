# Repository cleanup plan

This repo is still functional, but a few files look like temporary artifacts or legacy deployment helpers rather than core app code. The items below are good candidates for removal or archival if you want a cleaner repository.

## High-confidence removable files

These look like generated or temporary artifacts and are not part of the runtime app:

- server.log — generated CI/runtime log
- build_log.txt — generated build log
- converter_test_output.png — converter test artifact
- converter_fallback_test.png — converter fallback test artifact

## Likely removable or archive-worthy files

These may be old reports, local-only artifacts, or deployment-specific helpers:

- BILLIONOEL BTECH REPORT ON ACADEX.pdf
- BILLIONOEL1 BTECH REPORT ON ACADEX.docx
- TEBEI NOEL BTECH REPORT ON ACADEX.pdf

If these are not required for compliance, audit, or product documentation, archive them outside the repo or move them to a separate documents folder.

## Optional cleanup candidates

These are not obviously broken, but they look more like local tooling than app code:

- hnd_backend/probe-render.js — old Render-specific probe script
- hnd_backend/start-chroma.bat — optional local helper; not needed in production
- hnd_backend/docker-compose.chroma.yml — only useful if you run Chroma locally
- hnd_backend/model.nlp — likely local model artifact; confirm before deleting

## Keep these

These are still relevant to the current app and deployment flow:

- hnd_backend/server.js
- hnd_backend/Dockerfile
- hnd_backend/package.json
- render.yaml
- .github/workflows/backend-ci.yml
- src/config/api.js
- src/services/api.js

## Safe removal approach

1. Move questionable files to an archive folder or a private drive first.
2. Remove only the clearly generated files first.
3. Keep the deployment and app code intact until the repo is verified.
4. Re-run the app build and backend smoke checks after any cleanup.
