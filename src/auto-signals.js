/**
 * Auto Signal Generator
 * Fetches trending markets from Polymarket and generates signals automatically
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';
const SIGNAL_HUB = process.env.SIGNAL_HUB_URL || 'http://localhost:3456';

const TOPIC_KEYWORDS = {
  politics: ['trump', 'biden', 'election', 'congress', 'senate', 'president', 'vote', 'republican', 'democrat', 'political'],
  crypto: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'token', 'blockchain', 'defi', 'nft', 'solana'],
  sports: ['nfl', 'nba', 'mlb', 'soccer', 'football', 'basketball', 'championship', 'super bowl', 'world cup'],
  macro: ['fed', 'interest rate', 'inflation', 'gdp', 'recession', 'economy', 'jobs', 'unemployment', 'treasury'],
  tech: ['ai', 'openai', 'google', 'apple', 'microsoft', 'tesla', 'spacex', 'tech', 'startup'],
  culture: ['oscar', 'grammy', 'movie', 'celebrity', 'entertainment', 'music', 'award']
};

function detectTopic(text) {
  const lower = text.toLowerCase();
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return topic;
    }
  }
  return 'macro'; // default
}

function extractKeywords(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const keywords of Object.values(TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw) && !found.includes(kw)) {
        found.push(kw);
      }
    }
  }
  return found.slice(0, 5);
}

async function fetchTrendingMarkets() {
  const url = `${GAMMA_API}/events?closed=false&limit=20&order=volume24hr&ascending=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);
  return res.json();
}

async function publishSignal(signal) {
  const url = `${SIGNAL_HUB}/signal`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signal)
  });
  return res.json();
}

export async function generateSignals(count = 3) {
  console.log('[AUTO] Fetching trending markets...');
  const events = await fetchTrendingMarkets();
  
  const results = [];
  const used = new Set();
  
  for (const event of events.slice(0, count * 2)) {
    if (results.length >= count) break;
    
    const title = event.title || '';
    const topic = detectTopic(title);
    const keywords = extractKeywords(title + ' ' + (event.description || ''));
    
    // Skip if we already did this topic this round
    if (used.has(topic) && results.length > 0) continue;
    used.add(topic);
    
    const signal = {
      agentId: 'signal-bot',
      topic,
      sourceUrl: `https://polymarket.com/event/${event.slug}`,
      sourceTitle: title,
      keywords: keywords.length ? keywords : [topic],
      confidence: Math.min(0.95, 0.6 + (parseFloat(event.volume24hr || 0) / 1000000) * 0.1),
      markets: [{
        slug: event.slug,
        title: title,
        volume24hr: event.volume24hr,
        liquidity: event.liquidity
      }]
    };
    
    try {
      const result = await publishSignal(signal);
      console.log(`[AUTO] Published: ${topic} - ${title.slice(0, 50)}... (${result.signalId || result.duplicateOf || 'ok'})`);
      results.push(result);
    } catch (e) {
      console.error(`[AUTO] Failed: ${e.message}`);
    }
  }
  
  return results;
}

// Internal version that accepts a postSignal callback (used by signal-hub directly)
export async function generateSignalsInternal(count = 3, postSignal) {
  console.log('[AUTO] Fetching trending markets...');
  const events = await fetchTrendingMarkets();
  
  const results = [];
  const used = new Set();
  
  for (const event of events.slice(0, count * 2)) {
    if (results.length >= count) break;
    
    const title = event.title || '';
    const topic = detectTopic(title);
    const keywords = extractKeywords(title + ' ' + (event.description || ''));
    
    // Skip if we already did this topic this round
    if (used.has(topic) && results.length > 0) continue;
    used.add(topic);
    
    const signal = {
      agentId: 'signal-bot',
      topic,
      sourceUrl: `https://polymarket.com/event/${event.slug}`,
      sourceTitle: title,
      keywords: keywords.length ? keywords : [topic],
      confidence: Math.min(0.95, 0.6 + (parseFloat(event.volume24hr || 0) / 1000000) * 0.1),
      markets: [{
        slug: event.slug,
        title: title,
        volume24hr: event.volume24hr,
        liquidity: event.liquidity
      }]
    };
    
    try {
      const result = await postSignal(signal);
      console.log(`[AUTO] Published: ${topic} - ${title.slice(0, 50)}... (${result.signalId || result.duplicateOf || 'ok'})`);
      results.push(result);
    } catch (e) {
      console.error(`[AUTO] Failed: ${e.message}`);
    }
  }
  
  return results;
}

// Run on interval if executed directly
const INTERVAL_MS = parseInt(process.env.AUTO_SIGNAL_INTERVAL_MS || '300000', 10); // 5 min default

async function loop() {
  try {
    await generateSignals(3);
  } catch (e) {
    console.error('[AUTO] Error:', e.message);
  }
  setTimeout(loop, INTERVAL_MS);
}

// Auto-start if run directly
if (process.argv[1]?.endsWith('auto-signals.js')) {
  console.log(`[AUTO] Starting auto signal generator (interval: ${INTERVAL_MS / 1000}s)`);
  loop();
}

export default { generateSignals };
