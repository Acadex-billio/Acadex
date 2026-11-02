# Vercel frontend + Railway backend deployment guide

This guide keeps the frontend on Vercel and moves the backend from Render to Railway.

## 1. Current deployment split

- Frontend: Vercel
  - Build from the repository root
  - Serves the React app from Vercel
  - Uses the frontend environment variable REACT_APP_API_URL

- Backend: Railway
  - Builds from the repository root using the root `railway.toml`
  - Uses `hnd_backend/Dockerfile` for the API service
  - Exposes the API on Railway’s assigned public URL

## 2. Recommended repo structure for this setup

Keep the repo as-is with these deployment boundaries:

- Root project for the frontend React app and Railway build context
- `hnd_backend` directory for the API source and Dockerfile

Keep the Railway service root directory at the repository root. The Dockerfile copies the backend source from `hnd_backend/`, and its Docker build context must include that folder.

## 3. Frontend environment variables on Vercel

Set these in Vercel Project Settings -> Environment Variables:

- REACT_APP_API_URL=https://api.acadexe.com/api
- REACT_APP_DEBUG_LOGS=false

For Safari/iOS, configure `api.acadexe.com` as a custom domain for the Railway API service and add the DNS record Railway provides. This keeps browser API requests on the same site as `acadexe.com` / `www.acadexe.com`, so Safari can use the authentication cookies. Do not use the Railway-assigned `*.up.railway.app` or Render domain as the production browser API URL.

If the frontend is still pointing at Render URLs, update them before the first redeploy.

## 4. Backend environment variables on Railway

Add the following in Railway -> Project -> Variables:

Required:
- NODE_ENV=production
- PORT=5000
- HOST=0.0.0.0
- JWT_SECRET=<strong-random-secret>
- SESSION_SECRET=<strong-random-secret>
- MONGODB_URI=<your-mongodb-connection-string>
- VAPID_PUBLIC_KEY=<generated VAPID public key>
- VAPID_PRIVATE_KEY=<matching VAPID private key>
- VAPID_SUBJECT=mailto:<support-email>

Commonly needed:
- CORS_ORIGIN=https://www.acadexe.com,https://acadexe.com
- AUTH_COOKIE_SAME_SITE=lax
- AI_FEATURES_ENABLED=false
- CAMERPAY_TOKEN=<if applicable>
- AWS_ACCESS_KEY_ID=<if applicable>
- AWS_SECRET_ACCESS_KEY=<if applicable>
- AWS_BUCKET_NAME=<if applicable>
- AWS_S3_URL=<if applicable>
- RESEND_API_KEY=<if applicable>
- OPENAI_API_KEY=<if applicable>
- TAVILY_API_KEY=<if applicable>

## 5. Railway deployment settings

In Railway:

1. Create a new project.
2. Add a new service.
3. Connect this repository.
4. Leave the service root directory at the repository root.
5. Let `railway.toml` select `hnd_backend/Dockerfile`.
6. Deploy.

Railway should build the backend using the Dockerfile and start it with npm start.

## 6. Important notes for the backend

- The backend should bind to 0.0.0.0.
- The app should respond at / and /api/health.
- The frontend API URL should end in /api so requests resolve correctly.
- If MongoDB is unavailable, the app should still start enough to answer health checks, but full API behavior will depend on the database.

## 7. Vercel deployment checklist

Before deploying the frontend again:

1. Confirm the Vercel build succeeds.
2. Confirm `api.acadexe.com` resolves to the Railway API service and its TLS certificate is active.
3. Set `REACT_APP_API_URL=https://api.acadexe.com/api` and redeploy the frontend.
4. Set `AUTH_COOKIE_SAME_SITE=lax` and the exact production frontend origin(s) in `CORS_ORIGIN`, then redeploy the backend.
5. Confirm the frontend requests are hitting `api.acadexe.com`.
6. Test login on iPhone Safari and Chrome; verify `/api/auth/me` succeeds after login and after a page reload.

## 8. Health verification

After deployment, verify:

- Frontend loads on Vercel
- Backend responds at https://api.acadexe.com/api/health
- Frontend can call the backend without CORS issues
- Login session survives a page reload in iPhone Safari

## 9. Optional cleanup after migration

Once the Railway backend is verified, you can retire old Render-specific wiring:

- Remove or update any Render-only environment variables
- Update any old docs still pointing to Render as the backend host
- Change the GitHub keepalive workflow to ping the Railway health endpoint instead of the Render URL
