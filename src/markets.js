/**
 * Markets Browser — Fetch and browse active Polymarket markets
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';

const TOPIC_KEYWORDS = {
  politics: ['trump', 'biden', 'election', 'congress', 'senate', 'president', 'vote', 'republican', 'democrat', 'political', 'governor', 'mayor'],
  crypto: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'token', 'blockchain', 'defi', 'nft', 'solana', 'price'],
  sports: ['nfl', 'nba', 'mlb', 'soccer', 'football', 'basketball', 'championship', 'super bowl', 'world cup', 'ufc', 'boxing'],
  macro: ['fed', 'interest rate', 'inflation', 'gdp', 'recession', 'economy', 'jobs', 'unemployment', 'treasury', 'tariff'],
  tech: ['ai', 'openai', 'google', 'apple', 'microsoft', 'tesla', 'spacex', 'tech', 'startup', 'robot'],
  culture: ['oscar', 'grammy', 'movie', 'celebrity', 'entertainment', 'music', 'award', 'netflix', 'streaming']
};

function detectTopic(text) {
  const lower = (text || '').toLowerCase();
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return topic;
    }
  }
  return 'other';
}

export async function fetchMarkets({ limit = 50, topic = null, sort = 'volume' } = {}) {
  const order = sort === 'newest' ? 'createdAt' : 'volume24hr';
  const url = `${GAMMA_API}/events?closed=false&limit=${Math.min(limit * 2, 100)}&order=${order}&ascending=false`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);
  
  let events = await res.json();
  
  // Enrich with topic detection
  events = events.map(e => ({
    slug: e.slug,
    title: e.title,
    description: e.description?.slice(0, 200),
    topic: detectTopic(e.title + ' ' + (e.description || '')),
    volume24hr: parseFloat(e.volume24hr || 0),
    liquidity: parseFloat(e.liquidity || 0),
    endDate: e.endDate,
    markets: (e.markets || []).slice(0, 3).map(m => ({
      question: m.question,
      outcomePrices: m.outcomePrices
    })),
    polymarketUrl: `https://polymarket.com/event/${e.slug}`,
    jupiterUrl: `https://jup.ag/prediction/${e.slug}`
  }));
  
  // Filter by topic if specified
  if (topic && topic !== 'all') {
    events = events.filter(e => e.topic === topic);
  }
  
  return events.slice(0, limit);
}

export async function searchMarkets(query) {
  const events = await fetchMarkets({ limit: 100 });
  const q = query.toLowerCase();
  return events.filter(e => 
    e.title.toLowerCase().includes(q) || 
    (e.description || '').toLowerCase().includes(q)
  ).slice(0, 20);
}

export default { fetchMarkets, searchMarkets };
