const { createLogger, format, transports } = require('winston');

const logLevel = String(process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase();

const baseFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.splat(),
  format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
);

const humanReadable = format.printf((info) => {
  const requestId = info?.metadata?.requestId ? ` [${info.metadata.requestId}]` : '';
  const meta = info.metadata && Object.keys(info.metadata).length ? ` ${JSON.stringify(info.metadata)}` : '';
  return `${info.timestamp} ${info.level.toUpperCase()}${requestId} ${info.message}${meta}`;
});

const logger = createLogger({
  level: logLevel,
  format: format.combine(baseFormat, humanReadable),
  transports: [new transports.Console()],
});

module.exports = logger;
