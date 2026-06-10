# Acadex Environment Variables Setup

## 🔐 Required Environment Variables

Create a `.env` file in the backend directory with the following variables:

```bash
# Database Confi.guration
MONGODB_URI=mongodb://localhost:27017/hnd_platform
MONGO_MAX_POOL_SIZE=80
MONGO_MIN_POOL_SIZE=10
MONGO_SERVER_SELECTION_TIMEOUT_MS=10000
MONGO_CONNECT_TIMEOUT_MS=10000
MONGO_SOCKET_TIMEOUT_MS=45000
MONGO_MAX_IDLE_TIME_MS=60000

# Session Security (CRITICAL - Generate secure secret)
SESSION_SECRET=your-256-bit-secret-key-here

# Server Configuration
PORT=5000

# Email Configuration (for notifications)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# AI feature switch (set false to disable AI startup requirements)
AI_FEATURES_ENABLED=true
DEEPSEEK_API_KEY=replace-with-your-deepseek-api-key
GROQ_API_KEY=replace-with-your-groq-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.ai/v1
GROQ_BASE_URL=https://api.groq.ai/v1

# Chroma Vector DB (RAG)
CHROMA_URL=http://localhost:8000

# MoMo Collection Payments
MOMO_PROVIDER=mock
MOMO_TARGET_ENVIRONMENT=sandbox
MOMO_COLLECTION_BASE_URL=https://sandbox.momodeveloper.mtn.com/collection
MOMO_DEFAULT_COUNTRY_CODE=237
MOMO_SUBSCRIPTION_KEY=replace-with-your-momo-subscription-key
MOMO_API_USER=replace-with-your-created-momo-api-user-id
MOMO_API_KEY=replace-with-your-created-momo-api-key
MOMO_CALLBACK_URL=https://your-backend.example.com/api/payments/momo/callback
MOMO_MOCK_AUTO_SUCCESS=true
# Keep false by default. Set true only if you intentionally want mock payments in production.
ALLOW_MOMO_MOCK_IN_PRODUCTION=false

# CamerPay API Payments
CAMERPAY_TOKEN=replace-with-your-camerpay-api-token
CAMERPAY_API_BASE_URL=https://api.campay.net
CAMERPAY_CALLBACK_URL=https://your-backend.example.com/api/payment/camerpay/callback
CAMERPAY_RETURN_URL=https://your-frontend.example.com/payment/confirmation
CAMERPAY_FETCH_TIMEOUT_MS=15000
CAMERPAY_WEBHOOK_KEY=replace-with-your-camerpay-webhook-secret

# LiveKit Video Conferencing
# Example: wss://your-project-xxxx.livekit.cloud
LIVEKIT_URL=wss://your-livekit-host
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret

# API Rate Limit Tuning
API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX=1200
STRICT_RATE_LIMIT_WINDOW_MS=3600000
STRICT_RATE_LIMIT_MAX=30
UPLOAD_RATE_LIMIT_WINDOW_MS=3600000
UPLOAD_RATE_LIMIT_MAX=150

# LibreOffice conversion queue tuning
LIBREOFFICE_QUEUE_CONCURRENCY=4
LIBREOFFICE_QUEUE_MAX_SIZE=1000
LIBREOFFICE_QUEUE_WAIT_TIMEOUT_MS=180000
LIBREOFFICE_QUEUE_DEBUG=false
```

## 🔑 Generate Secure SESSION_SECRET

### Method 1: OpenSSL (Recommended)
```bash
# Generate 64-character secure hex string
SESSION_SECRET=$(openssl rand -hex 64)
echo "SESSION_SECRET=$SESSION_SECRET" >> hnd_backend/.env
```

### Method 2: Node.js Crypto
```bash
# Generate 64-character secure hex string
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

## 📧 Setup Commands

```bash
# 1. Create environment file (since .env is gitignored)
cd hnd_backend
touch .env

# 2. Generate secure session secret and add to .env
SESSION_SECRET=$(openssl rand -hex 64)
echo "SESSION_SECRET=$SESSION_SECRET" >> .env

# 3. Add other required variables
echo "MONGODB_URI=mongodb://localhost:27017/hnd_platform" >> .env
echo "PORT=5000" >> .env
echo "EMAIL_USER=your-email@gmail.com" >> .env
echo "EMAIL_PASS=your-gmail-app-password" >> .env
echo "CORS_ORIGIN=http://localhost:3000" >> .env
echo "CHROMA_URL=http://localhost:8000" >> .env

# 4. Install dependencies
npm install

# 5. Start development server
npm start
```

## 🔒 Security Notes

- **NEVER commit `.env` file to version control**
- **Use different secrets for development vs production**
- **Rotate SESSION_SECRET regularly** (recommended every 90 days)
- **Use app passwords for email, not main passwords**
- **Enable 2FA on email accounts**

## 🚨 Production Deployment

For production, ensure:

1. **Use strong, unique SESSION_SECRET** (64+ characters)
2. **Set production MONGODB_URI** with authentication
3. **Configure production EMAIL_USER/PASS**
4. **Set CORS_ORIGIN to production domain**
5. **Use HTTPS in production**

## 📋 Environment-Specific Examples

### Development (.env.dev)
```bash
MONGODB_URI=mongodb://localhost:27017/hnd_platform_dev
SESSION_SECRET=dev-secret-key-change-in-production
PORT=5000
EMAIL_USER=dev@example.com
EMAIL_PASS=dev-app-password
CORS_ORIGIN=http://localhost:3000
```

### Production (.env.prod)
```bash
MONGODB_URI=mongodb://username:password@cluster.mongodb.net/hnd_platform_prod
SESSION_SECRET=prod-super-secure-64-character-secret-key
PORT=5000
EMAIL_USER=production@example.com
EMAIL_PASS=prod-app-password
CORS_ORIGIN=https://yourdomain.com
```

---

⚠️ **Important**: Replace all placeholder values with actual secure values before deployment.
