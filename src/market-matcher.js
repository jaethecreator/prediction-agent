/**
 * Market Matcher - Core logic for matching content to prediction markets
 * 
 * Flow: Content → Entity Extraction → Gamma API Search → Ranked Markets
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';

/**
 * Extract betting-relevant entities from text using AI
 * @param {string} text - Article or content text
 * @param {object} openai - OpenAI client instance
 * @returns {Promise<string[]>} - Array of search keywords
 */
export async function extractEntities(text, openai) {
  const prompt = `Extract betting-relevant entities from this text. Focus on:
- People (politicians, athletes, CEOs)
- Events (elections, sports games, announcements)
- Topics (tariffs, interest rates, legislation)
- Timeframes (dates, deadlines)

Return ONLY a JSON array of 3-7 search keywords, ordered by relevance.
No explanation, just the array.

Text:
${text.slice(0, 2000)}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  try {
    // Clean markdown code blocks if present
    let content = response.choices[0].message.content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    return JSON.parse(content);
  } catch {
    // Fallback: split on common delimiters
    return response.choices[0].message.content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/[\[\]"]/g, '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
}

/**
 * Search Polymarket Gamma API for markets matching a query
 * @param {string} query - Search term
 * @returns {Promise<object[]>} - Array of market objects
 */
export async function searchMarkets(query) {
  const url = `${GAMMA_API}/events?closed=false&limit=20`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);
    
    const events = await res.json();
    
    // Filter events that match the query (case-insensitive)
    const q = query.toLowerCase();
    return events.filter(event => {
      const title = (event.title || '').toLowerCase();
      const description = (event.description || '').toLowerCase();
      return title.includes(q) || description.includes(q);
    });
  } catch (err) {
    console.error(`Search failed for "${query}":`, err.message);
    return [];
  }
}

/**
 * Fetch all active markets (for broader matching)
 * @param {number} limit - Max markets to fetch
 * @returns {Promise<object[]>} - Array of event objects with markets
 */
export async function fetchActiveMarkets(limit = 100) {
  const url = `${GAMMA_API}/events?closed=false&limit=${limit}&order=volume24hr&ascending=false`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);
  
  return res.json();
}

/**
 * Score how relevant a market is to given keywords
 * @param {object} event - Polymarket event object
 * @param {string[]} keywords - Extracted entities
 * @returns {number} - Relevance score (0-100)
 */
export function scoreRelevance(event, keywords) {
  const text = `${event.title} ${event.description}`.toLowerCase();
  
  let score = 0;
  let matches = 0;
  
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (text.includes(kwLower)) {
      matches++;
      // Title match worth more
      if ((event.title || '').toLowerCase().includes(kwLower)) {
        score += 20;
      } else {
        score += 10;
      }
    }
  }
  
  // Bonus for multiple keyword matches
  if (matches >= 2) score += 15;
  if (matches >= 3) score += 25;
  
  // Boost high-volume markets (liquidity = confidence)
  const volume = parseFloat(event.volume24hr || event.volume || 0);
  if (volume > 100000) score += 10;
  if (volume > 1000000) score += 10;
  
  return Math.min(score, 100);
}

/**
 * Main matching function - takes content, returns relevant markets
 * @param {string} content - Article/page content
 * @param {object} openai - OpenAI client
 * @param {object} options - { minScore, maxResults }
 * @returns {Promise<object[]>} - Ranked markets with scores
 */
export async function matchContent(content, openai, options = {}) {
  const { minScore = 20, maxResults = 10 } = options;
  
  // Step 1: Extract entities
  console.log('Extracting entities...');
  const keywords = await extractEntities(content, openai);
  console.log('Keywords:', keywords);
  
  // Step 2: Fetch active markets
  console.log('Fetching markets...');
  const events = await fetchActiveMarkets(200);
  console.log(`Found ${events.length} active events`);
  
  // Step 3: Score and rank
  const scored = events
    .map(event => ({
      ...event,
      relevanceScore: scoreRelevance(event, keywords),
      matchedKeywords: keywords.filter(kw => 
        `${event.title} ${event.description}`.toLowerCase().includes(kw.toLowerCase())
      )
    }))
    .filter(e => e.relevanceScore >= minScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxResults);
  
  // Step 4: Format output
  return scored.map(event => ({
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description?.slice(0, 200),
    volume24hr: event.volume24hr,
    liquidity: event.liquidity,
    endDate: event.endDate,
    relevanceScore: event.relevanceScore,
    matchedKeywords: event.matchedKeywords,
    markets: (event.markets || []).map(m => ({
      id: m.id,
      question: m.question,
      outcomePrices: m.outcomePrices, // YES/NO prices
    })),
    // TODO: append referral params & signal/agent attribution when available
    jupiterUrl: `https://jup.ag/prediction/${event.slug}`,
    polymarketUrl: `https://polymarket.com/event/${event.slug}`,
  }));
}

export default { matchContent, extractEntities, searchMarkets, fetchActiveMarkets };
