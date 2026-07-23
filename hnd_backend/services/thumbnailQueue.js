const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const thumbnailQueue = new Queue('thumbnailQueue', { connection });

module.exports = {
  thumbnailQueue,
  connection,
};
