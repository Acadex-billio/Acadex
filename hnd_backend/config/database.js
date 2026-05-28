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
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

module.exports = connectDB;
