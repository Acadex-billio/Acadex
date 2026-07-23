const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const queueEnabled = String(process.env.ENABLE_THUMBNAIL_QUEUE || 'false').trim().toLowerCase() === 'true';
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = queueEnabled ? new IORedis(redisUrl) : null;

const thumbnailQueue = queueEnabled ? new Queue('thumbnailQueue', { connection }) : null;

module.exports = {
  thumbnailQueue,
  connection,
  queueEnabled,
};
