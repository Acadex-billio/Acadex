/**
 * Simplified Multi-Platform Search Service
 * Focus on working platforms with better integration
 */
const https = require('https');

/**
 * Enhanced search across multiple platforms
 */
const searchWeb = async (query, maxResults = 5) => {
  try {
    console.log('[MultiSearch] Searching:', query);
    
    const allResults = [];
    
    // Platform 1: DuckDuckGo (main search engine)
    const ddgResult = await tryDuckDuckGo(query);
    allResults.push(...ddgResult);
    
    // Platform 2: Wikipedia (general knowledge)
    const wikiResult = await tryWikipedia(query);
    allResults.push(...wikiResult);
    
    // Platform 3: arXiv (academic papers)
    if (isAcademicTopic(query)) {
      const arxivResult = await tryArxiv(query);
      allResults.push(...arxivResult);
    }
    
    // Platform 4: Programming-specific searches
    if (isProgrammingTopic(query)) {
      // Use DuckDuckGo with site-specific searches
      const gfgResult = await trySiteSearch(query, 'geeksforgeeks.org');
      allResults.push(...gfgResult);
      
      const stackResult = await trySiteSearch(query, 'stackoverflow.com');
      allResults.push(...stackResult);
      
      const mdnResult = await trySiteSearch(query, 'developer.mozilla.org');
      allResults.push(...mdnResult);
    }
    
    // Platform 5: Reddit discussions
    const redditResult = await trySiteSearch(query, 'reddit.com');
    allResults.push(...redditResult);
    
    // Remove duplicates and format results
    const uniqueResults = deduplicateResults(allResults);
    const finalResults = uniqueResults.slice(0, maxResults);
    
    if (finalResults.length > 0) {
      return formatResponse(query, finalResults);
    } else {
      return generateFallback(query);
    }
    
  } catch (error) {
    console.error('[MultiSearch] Error:', error.message);
    return generateFallback(query);
  }
};

/**
 * DuckDuckGo search with better parsing
 */
async function tryDuckDuckGo(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const results = await makeRequest(url);
    
    const sources = [];
    
    // Add Abstract if available
    if (results.Abstract && results.AbstractURL) {
      sources.push({
        title: results.AbstractSource || 'DuckDuckGo',
        url: results.AbstractURL,
        snippet: results.Abstract,
        platform: 'DuckDuckGo'
      });
    }
    
    // Add Definition if available
    if (results.Definition && results.DefinitionURL) {
      sources.push({
        title: results.DefinitionSource || 'Dictionary',
        url: results.DefinitionURL,
        snippet: results.Definition,
        platform: 'DuckDuckGo'
      });
    }
    
    // Add RelatedTopics
    if (results.RelatedTopics && results.RelatedTopics.length > 0) {
      results.RelatedTopics.slice(0, 3).forEach(t => {
        if (t.FirstURL && t.Text && t.Text.length > 10) {
          sources.push({
            title: t.Text.substring(0, 100),
            url: t.FirstURL,
            snippet: t.Text,
            platform: 'DuckDuckGo'
          });
        }
      });
    }
    
    return sources;
  } catch (error) {
    console.error('[DuckDuckGo] Error:', error.message);
    return [];
  }
}

/**
 * Wikipedia API search
 */
async function tryWikipedia(query) {
  try {
    // Try direct page lookup first
    const directUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const directResult = await makeRequest(directUrl);
    
    if (directResult.extract && directResult.content_urls?.desktop?.page) {
      return [{
        title: directResult.title || 'Wikipedia',
        url: directResult.content_urls.desktop.page,
        snippet: directResult.extract,
        platform: 'Wikipedia'
      }];
    }
    
    // If direct lookup fails, try search
    const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.split(' ')[0])}`;
    const searchResult = await makeRequest(searchUrl);
    
    if (searchResult.extract && searchResult.content_urls?.desktop?.page) {
      return [{
        title: searchResult.title || 'Wikipedia',
        url: searchResult.content_urls.desktop.page,
        snippet: searchResult.extract,
        platform: 'Wikipedia'
      }];
    }
    
    return [];
  } catch (error) {
    console.error('[Wikipedia] Error:', error.message);
    return [];
  }
}

/**
 * arXiv academic search
 */
async function tryArxiv(query) {
  try {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=2`;
    const xml = await makeRequest(url);
    
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    const sources = [];
    
    entries.forEach(entry => {
      const title = entry.match(/<title>(.*?)<\/title>/)?.[1];
      const summary = entry.match(/<summary>(.*?)<\/summary>/)?.[1];
      const id = entry.match(/<id>(.*?)<\/id>/)?.[1];
      
      if (title && summary && id) {
        sources.push({
          title: title.trim(),
          url: id.trim(),
          snippet: summary.replace(/<[^>]*>/g, '').substring(0, 300),
          platform: 'arXiv'
        });
      }
    });
    
    return sources;
  } catch (error) {
    console.error('[arXiv] Error:', error.message);
    return [];
  }
}

/**
 * Site-specific search using DuckDuckGo
 */
async function trySiteSearch(query, site) {
  try {
    const searchQuery = `${query} site:${site}`;
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json&no_html=1`;
    const results = await makeRequest(url);
    
    const sources = [];
    if (results.RelatedTopics) {
      results.RelatedTopics.forEach(t => {
        if (t.FirstURL && t.FirstURL.includes(site) && t.Text && t.Text.length > 10) {
          sources.push({
            title: t.Text.substring(0, 100),
            url: t.FirstURL,
            snippet: t.Text,
            platform: getPlatformName(site)
          });
        }
      });
    }
    
    return sources.slice(0, 2);
  } catch (error) {
    console.error(`[${getPlatformName(site)}] Error:`, error.message);
    return [];
  }
}

/**
 * Helper functions
 */
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.headers['content-type']?.includes('application/json')) {
            resolve(JSON.parse(data));
          } else {
            resolve(data);
          }
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

function getPlatformName(site) {
  const platformNames = {
    'geeksforgeeks.org': 'GeeksforGeeks',
    'stackoverflow.com': 'Stack Overflow',
    'developer.mozilla.org': 'MDN Web Docs',
    'reddit.com': 'Reddit',
    'github.com': 'GitHub',
    'coursera.org': 'Coursera',
    'edx.org': 'edX'
  };
  return platformNames[site] || site;
}

function isProgrammingTopic(query) {
  const programmingKeywords = /\b(algorithm|programming|code|coding|javascript|python|java|cpp|data structure|function|method|class|object|array|loop|recursion|sorting|searching|api|framework|library|debug|test|git|database|sql|html|css|react|node|express|web development|frontend|backend)\b/i;
  return programmingKeywords.test(query);
}

function isAcademicTopic(query) {
  const academicKeywords = /\b(research|paper|study|theory|machine learning|artificial intelligence|neural network|deep learning|statistics|mathematics|computer science|academic|scholar|journal|conference|algorithm)\b/i;
  return academicKeywords.test(query);
}

function deduplicateResults(results) {
  const seen = new Set();
  return results.filter(result => {
    const key = result.url || result.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatResponse(query, results) {
  const answerText = results
    .slice(0, 3)
    .map((result, i) => {
      const platform = result.platform ? `[${result.platform}] ` : '';
      return `[${i + 1}] ${platform}${result.snippet}`;
    })
    .join('\n\n');
  
  const sourcesList = results.map(r => ({
    title: r.title,
    url: r.url,
    platform: r.platform
  }));
  
  return {
    text: `Based on multi-platform search results for "${query}":\n\n${answerText}\n\nSources: ${results.map(s => `${s.title} (${s.platform})`).join(', ')}`,
    sources: sourcesList
  };
}

function generateFallback(query) {
  return {
    text: `I couldn't find specific results across multiple platforms for "${query}". Try:\n\n1. Using more specific keywords\n2. Including the programming language or technology\n3. Asking about a particular aspect\n\nFor programming questions, try including terms like "javascript", "python", "react", etc.`,
    sources: []
  };
}

/**
 * Health check
 */
const healthCheck = async () => {
  try {
    const result = await searchWeb('test query', 1);
    return {
      success: true,
      service: 'Multi-Platform Search',
      message: 'Searching DuckDuckGo, Wikipedia, arXiv, Stack Overflow, GeeksforGeeks, MDN, Reddit'
    };
  } catch (error) {
    return {
      success: false,
      service: 'Multi-Platform Search',
      message: `Search error: ${error.message}`
    };
  }
};

module.exports = { searchWeb, healthCheck };
