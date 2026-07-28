/**
 * MongoDB Connection Configuration
 */
const mongoose = require('mongoose');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const buildMongoOptions = () => ({
  maxPoolSize: parsePositiveInt(process.env.MONGO_MAX_POOL_SIZE, 80),
  minPoolSize: parsePositiveInt(process.env.MONGO_MIN_POOL_SIZE, 10),
  serverSelectionTimeoutMS: parsePositiveInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS, 10000),
  connectTimeoutMS: parsePositiveInt(process.env.MONGO_CONNECT_TIMEOUT_MS, 10000),
  socketTimeoutMS: parsePositiveInt(process.env.MONGO_SOCKET_TIMEOUT_MS, 45000),
  maxIdleTimeMS: parsePositiveInt(process.env.MONGO_MAX_IDLE_TIME_MS, 60000),
  retryWrites: true,
});

const isDatabaseConnectionError = (error) => {
  const message = String(error?.message || error || '');
  return (
    error?.name === 'MongoServerSelectionError' ||
    error?.name === 'MongoNetworkError' ||
    /ECONNREFUSED|Server selection timed out|Topology|socket hang up|MongoServerSelectionError|MongoNetworkError/i.test(message)
  );
};

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hnd_platform';
    const mongoOptions = buildMongoOptions();
    await mongoose.connect(mongoUri, mongoOptions);
    console.log('MongoDB connected successfully');
    console.log('[Mongo] Connection options:', {
      maxPoolSize: mongoOptions.maxPoolSize,
      minPoolSize: mongoOptions.minPoolSize,
      serverSelectionTimeoutMS: mongoOptions.serverSelectionTimeoutMS,
      connectTimeoutMS: mongoOptions.connectTimeoutMS,
      socketTimeoutMS: mongoOptions.socketTimeoutMS,
      maxIdleTimeMS: mongoOptions.maxIdleTimeMS,
    });

    try {
      const ChatRoom = require('../models/ChatRoom');
      const collection = ChatRoom.collection;

      const safeDrop = async (indexName) => {
        try {
          await collection.dropIndex(indexName);
          console.log(`[Mongo] Dropped legacy index: ${indexName}`);
        } catch (e) {
          const msg = String(e?.message || '');
          if (e?.codeName === 'IndexNotFound' || msg.toLowerCase().includes('index not found')) return;
          console.warn(`[Mongo] Failed to drop index ${indexName}:`, msg);
        }
      };

      await safeDrop('dm_key_1');
      await safeDrop('invite_code_1');
      await safeDrop('invite_code_unique_partial');
      await safeDrop('dm_key_unique_partial');
      await ChatRoom.syncIndexes();
    } catch (e) {
      console.warn('[Mongo] ChatRoom index sync skipped:', e?.message || e);
    }
  } catch (err) {
    console.error('MongoDB connection error:', err?.message || err);
    throw err;
  }
};

mongoose.connection.on('error', (err) => {
  console.error('[DB] Connection error:', err?.message || err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

process.on('unhandledRejection', (reason) => {
  if (isDatabaseConnectionError(reason)) {
    console.warn('[DB] Ignored database connection rejection to keep the process alive:', reason?.message || reason);
    return;
  }
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  if (isDatabaseConnectionError(error)) {
    console.warn('[DB] Ignored uncaught database connection error to keep the process alive:', error?.message || error);
    return;
  }
  throw error;
});

module.exports = connectDB;
