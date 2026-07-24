const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const envQueueEnabled = String(process.env.ENABLE_THUMBNAIL_QUEUE || '').trim().toLowerCase();
const queueEnabled = envQueueEnabled === 'true' || Boolean(process.env.REDIS_URL);
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = queueEnabled ? new IORedis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
}) : null;

const thumbnailQueue = queueEnabled ? new Queue('thumbnailQueue', { connection }) : null;

module.exports = {
  thumbnailQueue,
  connection,
  queueEnabled,
};
