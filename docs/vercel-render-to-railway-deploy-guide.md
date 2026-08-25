# Vercel frontend + Railway backend deployment guide

This guide keeps the frontend on Vercel and moves the backend from Render to Railway.

## 1. Current deployment split

- Frontend: Vercel
  - Build from the repository root
  - Serves the React app from Vercel
  - Uses the frontend environment variable REACT_APP_API_URL

- Backend: Railway
  - Deploys the hnd_backend folder as a Node.js service
  - Uses the Dockerfile in hnd_backend
  - Exposes the API on Railway’s assigned public URL

## 2. Recommended repo structure for this setup

Keep the repo as-is with these deployment boundaries:

- Root project for the frontend React app
- hnd_backend directory for the API service

Do not try to deploy the backend from the repo root. Deploy the backend from the hnd_backend folder in Railway.

## 3. Frontend environment variables on Vercel

Set these in Vercel Project Settings -> Environment Variables:

- REACT_APP_API_URL=https://<your-railway-backend-url>/api
- REACT_APP_VAPID_PUBLIC_KEY=<public VAPID key matching the backend>
- REACT_APP_DEBUG_LOGS=false

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

Commonly needed:
- CORS_ORIGIN=https://<your-vercel-domain>
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
4. Set the service root directory to hnd_backend.
5. Use the existing Dockerfile.
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
2. Make sure REACT_APP_API_URL points to Railway.
3. Confirm the frontend requests are hitting the Railway backend URL.
4. Test the login and public API routes.

## 8. Health verification

After deployment, verify:

- Frontend loads on Vercel
- Backend responds at https://<railway-url>/api/health
- Frontend can call the backend without CORS issues

## 9. Optional cleanup after migration

Once the Railway backend is verified, you can retire old Render-specific wiring:

- Remove or update any Render-only environment variables
- Update any old docs still pointing to Render as the backend host
- Change the GitHub keepalive workflow to ping the Railway health endpoint instead of the Render URL
