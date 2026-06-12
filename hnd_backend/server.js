// v2.1.0 — includes billing subscription management routes
const path = require('path');
const dotenv = require('dotenv');

const rootEnvPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: rootEnvPath, quiet: true });
dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true, override: true });

const logger = require('./utils/logger');

// Validate critical environment variables
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error('Missing critical environment variables', { missingEnvVars });
  process.exit(1);
}

// Ensure NODE_ENV is explicitly set
if (!process.env.NODE_ENV) {
  logger.warn('NODE_ENV not set, defaulting to development');
  process.env.NODE_ENV = 'development';
}

// Validate JWT_SECRET length
if (process.env.JWT_SECRET.length < 32) {
  logger.error('JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

const connectDB = require('./config/database');
const { globalErrorHandler, AuthorizationError } = require('./utils/errorHandler');
const { requestLogger } = require('./middlewares/requestLogger');
const { sanitizeQuery } = require('./middlewares/inputValidation');
const { 
  securityHeaders, 
  apiRateLimit, 
  uploadRateLimit,
  securityAuditLogger,
  blockAttackPatterns
} = require('./utils/securityConfig');
const { 
  performanceMonitor, 
  compressionMiddleware,
  initPerformanceMonitoring
} = require('./utils/performance');
const authRoutes = require('./Routes/authRoutes');
const candidateRoutes = require('./Routes/candidateRoutes');
const adminRoutes = require('./Routes/adminRoutes');
const chatRoutes = require('./Routes/chatRoutes');
const aiToolsRoutes = require('./Routes/aiToolsRoutes');
const announcementRoutes = require('./Routes/announcementRoutes');
const webSearchRoutes = require('./Routes/webSearchRoutes');
const s3TestRoutes = require('./Routes/s3TestRoutes');
const ragRoutes = require('./Routes/ragRoutes');
const aiChatRoutes = require('./Routes/aiChatRoutes');
const lecturerRoutes = require('./Routes/lecturerRoutes');
const adRoutes = require('./Routes/adRoutes');
const publicRoutes = require('./Routes/publicRoutes');
const debugRoutes = require('./Routes/debugRoutes');
const { getLibreOfficeQueueStats } = require('./services/libreOfficeQueue');
const { startKeepalive } = require('./services/keepaliveNotifier');

const app = express();
const port = process.env.PORT || 5000;
const corsDebugEnabled = String(process.env.CORS_DEBUG || '').trim().toLowerCase() === 'true';
const startupDebugEnabled = String(process.env.STARTUP_DEBUG || '').trim().toLowerCase() === 'true';

connectDB();

// Initialize performance monitoring
initPerformanceMonitoring();

app.disable('x-powered-by');
app.use(requestLogger);

// Add compression middleware
app.use(compressionMiddleware);

app.use(securityHeaders);

// Performance monitoring
app.use(performanceMonitor);

// Security audit logging and attack pattern blocking
app.use(securityAuditLogger);
app.use(blockAttackPatterns);

const isHostedDeployment = Boolean(
  process.env.RENDER ||
  process.env.VERCEL ||
  process.env.RAILWAY_STATIC_URL ||
  process.env.DEPLOYMENT_ID ||
  process.env.FLY_APP_NAME
);
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production' && isHostedDeployment;
const allowDebugRoutes = String(process.env.DEBUG_ROUTES_ENABLED || 'true').trim().toLowerCase() === 'true' || !isProduction;
const isAiFeaturesEnabled = String(process.env.AI_FEATURES_ENABLED || 'true').trim().toLowerCase() !== 'false';

const getServiceReadiness = () => {
  const payment = {
    provider: 'camerpay',
    hasToken: Boolean(String(process.env.CAMERPAY_TOKEN || '').trim()),
  };

  const storage = {
    hasAccessKeyId: Boolean(String(process.env.AWS_ACCESS_KEY_ID || '').trim()),
    hasSecretAccessKey: Boolean(String(process.env.AWS_SECRET_ACCESS_KEY || '').trim()),
    hasBucketName: Boolean(String(process.env.AWS_BUCKET_NAME || '').trim()),
    hasS3Url: Boolean(String(process.env.AWS_S3_URL || '').trim()),
  };

  const email = {
    hasResendApiKey: Boolean(String(process.env.RESEND_API_KEY || '').trim()),
  };

  const ai = {
    enabled: isAiFeaturesEnabled,
    hasOpenAIKey: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
    hasTavilyKey: Boolean(String(process.env.TAVILY_API_KEY || '').trim()),
    hasDeepseekKey: Boolean(String(process.env.DEEPSEEK_API_KEY || '').trim()),
    hasGroqKey: Boolean(String(process.env.GROQ_API_KEY || '').trim()),
  };

  const ready = {
    payment: payment.hasToken,
    storage:
      storage.hasAccessKeyId &&
      storage.hasSecretAccessKey &&
      storage.hasBucketName &&
      storage.hasS3Url,
    email: email.hasResendApiKey,
    ai: !ai.enabled || (ai.hasOpenAIKey && ai.hasTavilyKey),
  };

  return { payment, storage, email, ai, ready };
};

if (isProduction) {
  const readiness = getServiceReadiness();

  if (!readiness.payment.hasToken) {
    logger.error('Missing CAMERPAY_TOKEN in production');
    process.exit(1);
  }

  if (!readiness.ready.storage) {
    logger.error('Missing AWS S3 configuration in production');
    process.exit(1);
  }

  if (!readiness.ready.email) {
    logger.error('Missing RESEND_API_KEY in production');
    process.exit(1);
  }

  if (isAiFeaturesEnabled && !readiness.ready.ai) {
    logger.error('AI features enabled but OPENAI_API_KEY or TAVILY_API_KEY missing in production');
    process.exit(1);
  }
}

const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// If no explicit CORS origins are provided via env, allow common hosting domains
// for the platform to reduce accidental 403s after redeploys. This is a safe
// fallback for quick recovery; for stricter security, set `CORS_ORIGIN` in
// your Render/Vercel environment to the specific frontend URL(s).
if (allowedOrigins.length === 0) {
  allowedOrigins.push('https://www.acadexe.com');
  allowedOrigins.push('https://hnd-platform.vercel.app');
  allowedOrigins.push('https://acadex-hng2.onrender.com');
}

if (startupDebugEnabled) {
  logger.debug('CORS debug info', {
    environment: isProduction ? 'production' : 'development',
    corsOrigin: process.env.CORS_ORIGIN,
    allowedOrigins,
  });
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (corsDebugEnabled) {
        logger.debug('CORS request origin', { origin });
      }
      
      // In production, require explicit Origin for cross-site requests.
      if (!origin) {
        if (corsDebugEnabled) logger.debug('CORS no origin header - allowing server-to-server request');
        return cb(null, true);
      }

      // Always allow localhost for development
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
      if (isLocalhost) {
        if (corsDebugEnabled) logger.debug('CORS localhost origin allowed', { origin });
        return cb(null, true);
      }
      
      if (allowedOrigins.length === 0) {
        if (!isProduction) {
          if (corsDebugEnabled) logger.debug('CORS development mode allowing request');
          return cb(null, true);
        }
        if (corsDebugEnabled) logger.debug('CORS production mode with no allowlist - blocking request');
        return cb(new AuthorizationError('CORS origin not allowed'));
      }
      
      if (allowedOrigins.includes(origin)) {
        if (corsDebugEnabled) logger.debug('CORS origin allowed', { origin });
        return cb(null, true);
      }
      
      if (corsDebugEnabled) {
        logger.debug('CORS origin blocked', { origin, allowedOrigins });
      }
      return cb(new AuthorizationError('CORS origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Preview-Page-Limit', 'X-Allow-Copy', 'X-Subscription-Plan'],
    maxAge: 86400, // 24 hours
  })
);

// Enhanced rate limiting configuration
app.use('/api/', apiRateLimit);
app.use('/api/admin/', uploadRateLimit);

app.use(express.json({
  verify: (req, _res, buf) => {
    if (buf && buf.length) req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true, verify: (req, _res, buf) => {
  if (buf && buf.length) req.rawBody = buf.toString('utf8');
}}));

// Sanitize all incoming queries to prevent injection
app.use(sanitizeQuery);
const sessionSecret = process.env.SESSION_SECRET;
const jwtSecret = process.env.JWT_SECRET;

if (!sessionSecret) {
  logger.warn('SESSION_SECRET is not set');
}

if (isProduction) {
  const normalizedSessionSecret = String(sessionSecret || '').trim();
  if (!normalizedSessionSecret || normalizedSessionSecret === 'dev-insecure-secret') {
    logger.error('SESSION_SECRET must be set to a strong value in production');
    process.exit(1);
  }
}

if (!jwtSecret) {
  logger.warn('JWT_SECRET is not set');
}

app.set('trust proxy', 1);

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const mongoSessionOptions = {
  serverSelectionTimeoutMS: parsePositiveInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS, 10000),
  connectTimeoutMS: parsePositiveInt(process.env.MONGO_CONNECT_TIMEOUT_MS, 10000),
  socketTimeoutMS: parsePositiveInt(process.env.MONGO_SOCKET_TIMEOUT_MS, 45000),
  maxPoolSize: parsePositiveInt(process.env.MONGO_MAX_POOL_SIZE, 80),
  minPoolSize: parsePositiveInt(process.env.MONGO_MIN_POOL_SIZE, 10),
  maxIdleTimeMS: parsePositiveInt(process.env.MONGO_MAX_IDLE_TIME_MS, 60000),
};

const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/hnd_platform',
  ttl: 7 * 24 * 60 * 60,
  mongoOptions: mongoSessionOptions,
});

if (startupDebugEnabled) {
  logger.info('Auth configuration (JWT-based)', {
    environment: process.env.NODE_ENV || 'development',
    isProduction,
    authentication: 'JWT Token-Based',
    jwtSecret: jwtSecret ? 'Set' : 'Missing',
    sessionSecret: sessionSecret ? 'Set' : 'Missing',
    note: 'Using JWT tokens for cross-device authentication compatibility'
  });
}

// Mobile detection middleware
const isMobile = (userAgent) => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
};

app.use(
  session({
    name: 'hnd.sid',
    secret: sessionSecret || 'dev-insecure-secret',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      // Production-secure configuration
      sameSite: isProduction ? 'strict' : 'lax',
      secure: isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: undefined,
    },
  })
);

sessionStore.on('connected', () => {
  logger.info('Session store connected');
});

sessionStore.on('error', (err) => {
  logger.error('Session store connection error', {
    error: err.message,
    stack: err.stack,
    mongoUri: process.env.MONGODB_URI ? 'Set' : 'Missing'
  });
});

sessionStore.on('disconnected', () => {
  logger.warn('Session store disconnected');
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Public routes (webhooks and other endpoints that don't require auth)
app.use('/api/payment', publicRoutes);
app.use('/api', publicRoutes); // Also mount publicRoutes at /api root for webhooks path (/api/webhooks/campay)

app.use('/api/auth', authRoutes);
app.use('/api/candidate', candidateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai-tools', aiToolsRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/web-search', webSearchRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/ai', aiChatRoutes);
app.use('/api/lecturers', lecturerRoutes);
app.use('/api/ads', adRoutes);

// Dev-only routes (enabled locally or when DEBUG_ROUTES_ENABLED=true)
if (allowDebugRoutes) {
  app.use('/api/storage', s3TestRoutes);
  app.use('/api/debug', debugRoutes);
  logger.info('Debug routes available (development/non-hosted environment)');
  logger.info('S3 test routes available (development/non-hosted environment)');
}


// Root route - redirect to frontend
app.get('/', (req, res) => {
  res.redirect('https://www.acadexe.com/');
});

// Health check endpoint - with database validation
app.get('/api/health', async (req, res) => {
  try {
    const readiness = getServiceReadiness();
    const queueStats = getLibreOfficeQueueStats();

    // Verify database connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database connection failed',
        timestamp: new Date().toISOString(),
        readiness: {
          storage: readiness.ready.storage,
          email: readiness.ready.email,
          payment: readiness.ready.payment,
          ai: readiness.ready.ai,
          conversionQueue: queueStats.queued < queueStats.maxQueueSize,
        },
      });
    }

    res.json({
      success: true,
      message: 'Acadex Backend is healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: 'connected',
      readiness: {
        storage: readiness.ready.storage,
        email: readiness.ready.email,
        payment: readiness.ready.payment,
        ai: readiness.ready.ai,
        conversionQueue: queueStats.queued < queueStats.maxQueueSize,
      },
      readinessDetails: {
        storage: {
          configured: readiness.ready.storage,
          checks: {
            hasAccessKeyId: readiness.storage.hasAccessKeyId,
            hasSecretAccessKey: readiness.storage.hasSecretAccessKey,
            hasBucketName: readiness.storage.hasBucketName,
            hasS3Url: readiness.storage.hasS3Url,
          },
        },
        email: {
          configured: readiness.ready.email,
          checks: {
            hasResendApiKey: readiness.email.hasResendApiKey,
          },
        },
        payment: {
          configured: readiness.ready.payment,
          checks: {
            provider: readiness.payment.provider,
            hasApiUser: readiness.payment.hasApiUser,
            hasApiKey: readiness.payment.hasApiKey,
            hasSubscriptionKey: readiness.payment.hasSubscriptionKey,
            mockAutoSuccess: readiness.payment.mockAutoSuccess,
          },
        },
        ai: {
          enabled: readiness.ai.enabled,
          configured: readiness.ready.ai,
          checks: {
            hasOpenAIKey: readiness.ai.hasOpenAIKey,
            hasTavilyKey: readiness.ai.hasTavilyKey,
            hasDeepseekKey: readiness.ai.hasDeepseekKey,
            hasGroqKey: readiness.ai.hasGroqKey,
          },
        },
        conversionQueue: {
          configured: true,
          checks: {
            concurrency: queueStats.concurrency,
            maxQueueSize: queueStats.maxQueueSize,
            running: queueStats.running,
            queued: queueStats.queued,
            completed: queueStats.completed,
            failed: queueStats.failed,
          },
        },
      },
    });
  } catch (err) {
    logger.error('Health check failed', { error: err.message, stack: err.stack, requestId: req.requestId });
    res.status(503).json({
      success: false,
      message: 'Health check failed'
    });
  }
});

app.use(globalErrorHandler);

app.listen(port, () => {
  logger.info('Server started', { port, nodeEnv: process.env.NODE_ENV || 'development' });
  try {
    // Start keepalive notifier in background if configured
    startKeepalive();
  } catch (err) {
    logger.warn('Failed to start keepalive notifier', { error: err.message });
  }
});
