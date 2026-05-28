/**
 * Performance Optimization Utilities
 * Caching, query optimization, and performance monitoring
 */

const mongoose = require('mongoose');
const NodeCache = require('node-cache');

const cacheDebugEnabled = String(process.env.CACHE_DEBUG || '').trim().toLowerCase() === 'true';
const perfDebugEnabled = String(process.env.PERF_DEBUG || '').trim().toLowerCase() === 'true';
const memoryDebugEnabled = String(process.env.MEMORY_DEBUG || '').trim().toLowerCase() === 'true';
const slowRequestThresholdMs = Number(process.env.SLOW_REQUEST_THRESHOLD_MS || 1200);

// In-memory cache for frequently accessed data
const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default TTL
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false
});

// Cache middleware factory
const cacheMiddleware = (keyPrefix, ttl = 300) => {
  return (req, res, next) => {
    const cacheKey = `${keyPrefix}:${JSON.stringify(req.params)}:${JSON.stringify(req.query)}`;
    
    // Try to get from cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      if (cacheDebugEnabled) {
        console.log('[Cache] Hit for key:', cacheKey);
      }
      return res.json(cachedData);
    }
    
    // Override res.json to cache the response
    const originalJson = res.json;
    res.json = function(data) {
      // Only cache successful responses
      if (res.statusCode === 200 && data.success !== false) {
        cache.set(cacheKey, data, ttl);
        if (cacheDebugEnabled) {
          console.log('[Cache] Set for key:', cacheKey);
        }
      }
      return originalJson.call(this, data);
    };
    
    next();
  };
};

// Clear cache by pattern
const clearCachePattern = (pattern) => {
  const keys = cache.keys().filter(key => key.includes(pattern));
  if (keys.length > 0) {
    cache.del(keys);
    if (cacheDebugEnabled) {
      console.log('[Cache] Cleared pattern:', pattern, 'keys:', keys.length);
    }
  }
};

// Database query optimization
const optimizeQuery = (query, options = {}) => {
  const {
    lean = true,           // Return plain JavaScript objects
    select = null,         // Select specific fields
    populate = null,       // Populate references
    sort = null,          // Sort order
    limit = null,         // Limit results
    skip = null           // Skip results
  } = options;

  let dbQuery = mongoose.model(query.model || 'User').find(query.filter || {});

  if (lean) dbQuery = dbQuery.lean();
  if (select) dbQuery = dbQuery.select(select);
  if (populate) dbQuery = dbQuery.populate(populate);
  if (sort) dbQuery = dbQuery.sort(sort);
  if (limit) dbQuery = dbQuery.limit(limit);
  if (skip) dbQuery = dbQuery.skip(skip);

  return dbQuery;
};

// Pagination helper
const paginate = async (model, filter = {}, options = {}) => {
  const {
    page = 1,
    limit = 20,
    sort = { createdAt: -1 },
    select = null,
    populate = null
  } = options;

  const skip = (page - 1) * limit;

  // Get total count
  const total = await model.countDocuments(filter);

  // Get paginated results
  const query = model.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit);

  if (select) query.select(select);
  if (populate) query.populate(populate);

  const results = await query.lean();

  return {
    results,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  };
};

// Performance monitoring middleware
const performanceMonitor = (req, res, next) => {
  const start = Date.now();
  
  // Override res.end to measure response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    
    // Log slow requests
    if (duration > slowRequestThresholdMs) {
      console.warn('[Performance] Slow request detected:', {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
      });
    }
    
    return originalEnd.apply(this, args);
  };
  
  next();
};

// Database connection monitoring
const monitorDatabasePerformance = () => {
  mongoose.connection.on('connected', () => {
    console.log('[DB] Connected to MongoDB');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[DB] Connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] Disconnected from MongoDB');
  });

  // Monitor query performance
  mongoose.set('debug', perfDebugEnabled);
};

// Batch processing helper
const batchProcess = async (items, processor, batchSize = 100) => {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => processor(item))
    );
    results.push(...batchResults);
    
    // Prevent memory overload
    if (i % (batchSize * 10) === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  
  return results;
};

// Memory usage monitoring
const memoryMonitor = () => {
  const usage = process.memoryUsage();
  
  if (memoryDebugEnabled) {
    console.log('[Memory] Usage:', {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
      cacheSize: cache.keys().length
    });
  }
  
  // Clear cache if memory usage is high
  if (usage.heapUsed > 500 * 1024 * 1024) { // 500MB
    console.warn('[Memory] High usage detected, clearing cache');
    cache.flushAll();
  }
};

// Compression middleware (if compression package is available)
let compression;
try {
  compression = require('compression');
} catch (e) {
  compression = null;
}

const compressionMiddleware = compression ? compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024
}) : (req, res, next) => next();

// Initialize performance monitoring
const initPerformanceMonitoring = () => {
  monitorDatabasePerformance();
  
  // Monitor memory usage every 5 minutes
  setInterval(memoryMonitor, 5 * 60 * 1000);
  
  console.log('[Performance] Monitoring initialized');
};

module.exports = {
  cacheMiddleware,
  clearCachePattern,
  optimizeQuery,
  paginate,
  performanceMonitor,
  batchProcess,
  compressionMiddleware,
  initPerformanceMonitoring,
  cache // Export cache instance for manual operations
};
