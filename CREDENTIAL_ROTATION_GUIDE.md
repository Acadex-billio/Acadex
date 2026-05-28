# POST-DEPLOYMENT CREDENTIAL ROTATION GUIDE

**CRITICAL:** Before deploying to production, you MUST rotate the exposed credentials.

---

## 🔴 EXPOSED CREDENTIALS (FROM GIT HISTORY)

The following were exposed in the `.env` file that was committed to git:

1. **MONGODB_URI** - Database connection with password
2. **JWT_SECRET** - Token signing key
3. **SESSION_SECRET** - Session encryption key
4. **GOOGLE_CSE_API_KEY** - Google search API key
5. **GOOGLE_CSE_SEARCH_ENGINE_ID** - Search engine ID
6. **RESEND_API_KEY** - Email service API key

---

## 📋 STEP-BY-STEP ROTATION

### Step 1: Generate New Secrets

```bash
# Generate new JWT_SECRET (64 characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate new SESSION_SECRET (64 characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output values (you'll use them in steps below).

---

### Step 2: Rotate MongoDB Password

**Location:** MongoDB Atlas Dashboard

1. Go to **Database Access** in MongoDB Atlas
2. Find the user that matches your MONGODB_URI
3. Click **Edit** → **Edit Password**
4. Generate a new password (or set one manually)
5. Copy the new connection string [Example format]:
   ```
   mongodb+srv://username:NEWPASSWORD@cluster.mongodb.net/hnd_platform
   ```

---

### Step 3: Regenerate Google Search Credentials

**Location:** Google Cloud Console

1. Go to https://console.cloud.google.com
2. Select your project
3. Go to **APIs & Services** → **Credentials**
4. Find your API Key
5. Click the key and **Regenerate** or create a new one
6. Update `GOOGLE_CSE_API_KEY` with the new key

For `GOOGLE_CSE_SEARCH_ENGINE_ID`:
- Go to **Custom Search Engine**
- Search for your search engine ID
- It should remain the same, but verify it still works

---

### Step 4: Regenerate Resend API Key

**Location:** Resend Dashboard

1. Go to https://resend.com/api-keys
2. Click the existing key and **Delete** it
3. Click **Create API Key** to generate a new one
4. Copy the new key for `RESEND_API_KEY`

---

### Step 5: Update Environment Variables

Update your deployment environment with new values:

**For Vercel (Frontend):**
```bash
vercel env add REACT_APP_API_URL
```

**For Render (Backend):**
Go to your service settings → **Environment** and update:
- `MONGODB_URI` → new MongoDB connection string
- `JWT_SECRET` → new secret
- `SESSION_SECRET` → new secret
- `GOOGLE_CSE_API_KEY` → new key
- `RESEND_API_KEY` → new key

Or via Render CLI:
```bash
render env update JWT_SECRET=<new_secret>
render env update SESSION_SECRET=<new_secret>
render env update MONGODB_URI=<new_connection>
render env update GOOGLE_CSE_API_KEY=<new_key>
render env update RESEND_API_KEY=<new_key>
```

---

### Step 6: Redeploy Applications

**Frontend (Vercel):**
```bash
git push origin main  # Trigger automatic deployment
# Or manually redeploy from Vercel dashboard
```

**Backend (Render):**
```bash
git push origin main  # Trigger automatic deployment
# Monitor: https://dashboard.render.com
```

---

### Step 7: Verify Deployment

After redeployment, test:

```bash
# Health check
curl https://hnd-platform-backend.onrender.com/api/health

# Login test
curl -X POST https://hnd-platform-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'

# Verify response has JWT token
```

---

## ⚠️ ADDITIONAL SECURITY MEASURES

### 1. Force Password Resets for All Users

Email all users asking them to reset their password via the password reset flow. This ensures even if usernames/emails are known, passwords haven't been compromised.

### 2. Invalidate Existing Tokens

If you're changing JWT_SECRET, all existing tokens become invalid (users will need to log in again).

Add to `server.js` if you want a grace period:

```javascript
// List old JWT secrets (use for 24 hours, then remove)
const LEGACY_JWT_SECRETS = ['old_secret_1', 'old_secret_2'];

// In jwtUtils.js verifyToken, try old secrets if current fails
```

### 3. Monitor Access Logs

Check your server logs for any suspicious activity:
- Repeated failed login attempts
- Access to /admin endpoints from unusual IPs
- Large data exports or deletions

### 4. Optional: Clear Old Sessions

MongoDB:
```javascript
db.sessions.deleteMany({ createdAt: { $lt: new Date(Date.now() - 24*60*60*1000) } });
```

---

## 🔐 FUTURE PREVENTION

### 1. Use Environment Management Service

Instead of `.env` files, use:
- **HashiCorp Vault** (enterprise)
- **AWS Secrets Manager**
- **Vercel/Render Environment Secrets** (already using)

### 2. Rotate Credentials Regularly

- Quarterly: API keys and secrets
- Semi-annually: Database passwords
- Following any access incident

### 3. Audit Git History

Check if these credentials were exposed on public GitHub:

```bash
# Check git history
git log --source --full-history --all -p | grep -i "secret\|password\|api_key" | head -20

# Use git-secrets tool
npm install -g git-secrets
git secrets --install
git secrets --register-aws
git secrets --scan
```

### 4. Enable GitHub Security Alerts

- Go to Settings → Security & analysis
- Enable "Secret scanning"
- Enable "Push protection"

### 5. Create .env.example for Team

```
# .env.example - DO NOT COMMIT REAL VALUES
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name
JWT_SECRET=your-64-character-random-secret-key-minimum-32-characters-required
SESSION_SECRET=your-32-character-random-session-secret-key
# ... etc
```

---

## 📞 INCIDENT RESPONSE

If you suspect credentials are compromised:

1. **Immediate:** Rotate CRITICAL secrets (JWT_SECRET, database password)
2. **Within 1 hour:** Rotate all API keys
3. **Within 4 hours:** Send security alert to all users
4. **Within 24 hours:** Force all users to re-authenticate
5. **Ongoing:** Monitor logs for suspicious activity

---

## ✅ FINAL CHECKLIST

- [ ] Generated new JWT_SECRET
- [ ] Generated new SESSION_SECRET
- [ ] Rotated MongoDB password
- [ ] Rotated Google API keys
- [ ] Rotated Resend API key
- [ ] Updated environment variables in Vercel
- [ ] Updated environment variables in Render
- [ ] Redeployed frontend
- [ ] Redeployed backend
- [ ] Tested health endpoint
- [ ] Tested login endpoint
- [ ] Verified no old credentials in git history
- [ ] Enabled secret scanning on GitHub
- [ ] Created security policy document
- [ ] Notified relevant team members

---

## 📚 REFERENCES

- [OWASP - Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Git Secrets Tool](https://github.com/awslabs/git-secrets)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [MongoDB Security Best Practices](https://docs.mongodb.com/manual/security/)
