/**
 * DuckDuckGo Search Controller
 * Replaces Google Custom Search with DuckDuckGo Instant Answer API
 */
const { searchWeb, healthCheck } = require('../services/duckDuckGoService');

/**
 * Perform web search using DuckDuckGo
 */
exports.search = async (req, res) => {
  try {
    const { query } = req.query;
    const q = req.body?.query || query;
    
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Query is required and must be a non-empty string'
      });
    }
    
    console.log('[WebSearch] Request:', q);
    const result = await searchWeb(q.trim());
    
    res.json({
      success: true,
      query: q,
      ...result
    });
    
  } catch (error) {
    console.error('[WebSearch] Controller error:', error);
    res.status(500).json({
      success: false,
      message: 'Web search service temporarily unavailable'
    });
  }
};

/**
 * Health check endpoint
 */
exports.health = async (req, res) => {
  try {
    const status = await healthCheck();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      success: false,
      service: 'DuckDuckGo',
      message: `Health check failed: ${error.message}`
    });
  }
};
