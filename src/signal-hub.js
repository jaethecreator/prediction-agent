/**
 * Signal Hub - AI-to-AI prediction signal broadcasting
 * 
 * Pub/Sub architecture:
 * - Agents register with topics they care about
 * - When a signal is published, all subscribed agents get webhooks
 * - Optional: log signals on-chain for transparency
 */

import express from 'express';
import crypto from 'node:crypto';

const app = express();
app.use(express.json());

// In-memory storage (swap for Redis/DB in production)
const subscribers = new Map();  // topic -> Set<{agentId, webhookUrl}>
const signals = [];             // Recent signals (ring buffer)
const MAX_SIGNALS = 1000;

// Provider reputation and dedup state
const providerStats = new Map(); // agentId -> { sent, delivered, failures, duplicates, uniqueSignals, score }
const recentHashes = new Map();  // hash -> { signalId, topic, firstAt, providers: Set<agentId> }
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Valid topics
const TOPICS = ['politics', 'sports', 'crypto', 'macro', 'culture', 'tech', 'all'];

function normalizeSignalForHash({ topic, markets = [], keywords = [] }) {
  const slugs = (markets || [])
    .map(m => m.slug || m.predictionSlug || (m.title || m.question || ''))
    .filter(Boolean)
    .map(s => s.toString().toLowerCase().trim())
    .sort();
  const kws = (keywords || [])
    .map(k => k.toString().toLowerCase().trim())
    .sort();
  const payload = JSON.stringify({ topic: (topic||'').toLowerCase(), slugs, kws });
  return crypto.createHash('sha1').update(payload).digest('hex');
}

function ensureProvider(agentId) {
  if (!providerStats.has(agentId)) {
    providerStats.set(agentId, { sent: 0, delivered: 0, failures: 0, duplicates: 0, uniqueSignals: 0, score: 0 });
  }
  return providerStats.get(agentId);
}

function recalcScore(stats) {
  // Simple heuristic: deliveries matter, failures penalize, duplicates penalize more
  stats.score = Math.max(0,
    stats.delivered * 2 +
    stats.uniqueSignals * 1 -
    stats.failures * 1 -
    stats.duplicates * 2
  );
}

/**
 * POST /subscribe
 * Register an agent to receive signals for specific topics
 * 
 * Body: { agentId, webhookUrl, topics: ['politics', 'sports'] }
 */
app.post('/subscribe', (req, res) => {
  const { agentId, webhookUrl, topics } = req.body;
  
  if (!agentId || !webhookUrl || !topics?.length) {
    return res.status(400).json({ error: 'Missing required fields: agentId, webhookUrl, topics' });
  }
  
  const validTopics = topics.filter(t => TOPICS.includes(t));
  if (!validTopics.length) {
    return res.status(400).json({ error: `Invalid topics. Valid: ${TOPICS.join(', ')}` });
  }
  
  for (const topic of validTopics) {
    if (!subscribers.has(topic)) {
      subscribers.set(topic, new Set());
    }
    subscribers.get(topic).add(JSON.stringify({ agentId, webhookUrl }));
  }
  
  console.log(`[SUB] ${agentId} subscribed to: ${validTopics.join(', ')}`);
  res.json({ ok: true, subscribedTopics: validTopics });
});

/**
 * POST /unsubscribe
 * Remove an agent from topics
 * 
 * Body: { agentId, topics?: [...] }  // If no topics, unsubscribe from all
 */
app.post('/unsubscribe', (req, res) => {
  const { agentId, topics } = req.body;
  
  if (!agentId) {
    return res.status(400).json({ error: 'Missing agentId' });
  }
  
  const topicsToRemove = topics?.length ? topics : TOPICS;
  let removed = 0;
  
  for (const topic of topicsToRemove) {
    if (subscribers.has(topic)) {
      const subs = subscribers.get(topic);
      for (const sub of subs) {
        const parsed = JSON.parse(sub);
        if (parsed.agentId === agentId) {
          subs.delete(sub);
          removed++;
        }
      }
    }
  }
  
  console.log(`[UNSUB] ${agentId} unsubscribed from ${removed} topics`);
  res.json({ ok: true, removed });
});

/**
 * POST /signal
 * Publish a prediction signal to the network
 * 
 * Body: {
 *   agentId: 'hermes-001',
 *   topic: 'politics',
 *   markets: [...],           // Matched markets from market-matcher
 *   sourceUrl: 'https://...',
 *   sourceTitle: 'Article title',
 *   keywords: ['trump', 'tariffs'],
 *   confidence: 0.85          // How confident the match is
 * }
 */
app.post('/signal', async (req, res) => {
  const { agentId, topic, markets, sourceUrl, sourceTitle, keywords, confidence } = req.body;
  
  if (!agentId || !topic || !markets?.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (!TOPICS.includes(topic)) {
    return res.status(400).json({ error: `Invalid topic. Valid: ${TOPICS.join(', ')}` });
  }

  // Deduplicate within a short window to prevent spam/manipulation
  const hash = normalizeSignalForHash({ topic, markets, keywords });
  const now = Date.now();
  const existing = recentHashes.get(hash);
  if (existing && (now - existing.firstAt) <= DEDUP_WINDOW_MS) {
    const stats = ensureProvider(agentId);
    stats.duplicates += 1;
    recalcScore(stats);
    console.log(`[DEDUP] ${agentId} duplicate of ${existing.signalId} (topic=${topic})`);
    return res.json({ ok: true, duplicateOf: existing.signalId, dedupWindowSec: Math.floor((DEDUP_WINDOW_MS - (now - existing.firstAt))/1000) });
  }
  
  const signal = {
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    agentId,
    topic,
    markets: markets.slice(0, 5), // Limit to top 5 markets
    sourceUrl,
    sourceTitle,
    keywords,
    confidence,
  };

  // Append referral attribution params to Jupiter URLs when available
  try {
    const { buildJupiterUrl } = await import('./referral.js');
    signal.markets = signal.markets.map(m => {
      if (m.slug || m.predictionSlug || m.jupiterUrl) {
        const slug = m.slug || m.predictionSlug || (m.jupiterUrl?.split('/prediction/')[1] || '').split('?')[0];
        const url = buildJupiterUrl(slug, { signalId: signal.id, providerAgentId: agentId });
        return { ...m, jupiterUrl: url };
      }
      return m;
    });
  } catch (e) {
    console.warn('Referral URL build skipped:', e.message);
  }
  
  // Store signal
  signals.push(signal);
  if (signals.length > MAX_SIGNALS) signals.shift();
  // Track dedup hash
  recentHashes.set(hash, { signalId: signal.id, topic, firstAt: now, providers: new Set([agentId]) });
  
  // Broadcast to subscribers
  const topicsToNotify = [topic];
  if (topic !== 'all') topicsToNotify.push('all');
  
  let delivered = 0;
  const failures = [];
  
  for (const t of topicsToNotify) {
    const subs = subscribers.get(t) || new Set();
    for (const subJson of subs) {
      const { agentId: subAgentId, webhookUrl } = JSON.parse(subJson);
      
      // Don't send to self
      if (subAgentId === agentId) continue;
      
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(signal),
        });
        
        if (response.ok) {
          delivered++;
          console.log(`[DELIVER] → ${subAgentId}`);
        } else {
          failures.push({ agentId: subAgentId, status: response.status });
        }
      } catch (err) {
        failures.push({ agentId: subAgentId, error: err.message });
      }
    }
  }
  
  // Update provider reputation
  const stats = ensureProvider(agentId);
  stats.sent += 1;
  stats.delivered += delivered;
  stats.failures += failures.length;
  stats.uniqueSignals += 1;
  recalcScore(stats);

  console.log(`[SIGNAL] ${agentId} published to ${topic}: ${markets.length} markets, ${delivered} delivered (score=${stats.score})`);
  
  res.json({
    ok: true,
    signalId: signal.id,
    delivered,
    failures: failures.length ? failures : undefined,
    providerScore: stats.score,
  });
});

/**
 * GET /signals
 * Fetch recent signals (for debugging/dashboard)
 * Query: ?topic=politics&limit=20
 */
app.get('/signals', (req, res) => {
  const { topic, limit = 50 } = req.query;
  
  let filtered = signals;
  if (topic && topic !== 'all') {
    filtered = signals.filter(s => s.topic === topic);
  }
  
  res.json(filtered.slice(-parseInt(limit)).reverse());
});

/**
 * GET /stats
 * Hub statistics
 */
app.get('/stats', (req, res) => {
  const stats = {
    totalSignals: signals.length,
    subscribersByTopic: {},
    recentSignals: signals.slice(-5).reverse(),
    topProviders: [...providerStats.entries()]
      .map(([agentId, s]) => ({ agentId, ...s }))
      .sort((a,b) => b.score - a.score)
      .slice(0, 10)
  };
  
  for (const [topic, subs] of subscribers) {
    stats.subscribersByTopic[topic] = subs.size;
  }
  
  res.json(stats);
});

/**
 * POST /match (planned)
 * Accept raw content and return matched markets (uses market-matcher)
 */
app.post('/match', async (req, res) => {
  // Placeholder until OpenAI client wiring is added
  res.status(501).json({ error: 'Not implemented yet. Coming soon.' });
});

/**
 * GET /reputation
 * Return provider reputation stats (optionally filter by agentId)
 */
app.get('/reputation', (req, res) => {
  const { agentId } = req.query;
  if (agentId) {
    const stats = providerStats.get(agentId) || { sent: 0, delivered: 0, failures: 0, duplicates: 0, uniqueSignals: 0, score: 0 };
    return res.json({ agentId, ...stats });
  }
  const all = [...providerStats.entries()].map(([id, s]) => ({ agentId: id, ...s }));
  res.json(all.sort((a,b) => b.score - a.score));
});

/**
 * GET /dashboard - Visual dashboard
 */
app.get('/dashboard', async (req, res) => {
  try {
    const { generateDashboard } = await import('./dashboard.js');
    const html = generateDashboard({ signals, providerStats, subscribers });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (e) {
    res.status(500).send('Dashboard error: ' + e.message);
  }
});

/**
 * GET / - Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Prediction Agent Signal Hub',
    version: '0.2.0',
    endpoints: [
      'GET /dashboard - Visual dashboard',
      'POST /subscribe - Register for topic signals',
      'POST /signal - Broadcast a prediction signal',
      'GET /signals - View recent signals',
      'GET /stats - Hub statistics',
      'GET /reputation - Provider leaderboard',
      'GET /health - Health check'
    ],
    topics: TOPICS,
    referral: {
      account: process.env.JUP_REFERRAL_ACCOUNT || null,
      feeBps: parseInt(process.env.JUP_FEE_BPS || '150', 10)
    },
    built_for: 'Circle USDC & Colosseum Hackathons',
    author: 'Hermes ⚡'
  });
});

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Export for external use
export { app, subscribers, signals };

// Start server if run directly
const PORT = process.env.PORT || 3456;

export function startHub() {
  app.listen(PORT, () => {
    console.log(`🔮 Signal Hub running on http://localhost:${PORT}`);
    console.log(`Topics: ${TOPICS.join(', ')}`);
  });
}

// Auto-start when run directly
startHub();

// Start auto signal generator after a brief delay
setTimeout(async () => {
  try {
    const { generateSignalsInternal } = await import('./auto-signals.js');
    
    // Pass the internal signal handler
    const postSignal = async (signal) => {
      // Simulate the /signal endpoint logic inline
      const { agentId, topic, markets, sourceUrl, sourceTitle, keywords, confidence } = signal;
      if (!agentId || !topic || !markets?.length) return { error: 'missing fields' };
      
      const hash = normalizeSignalForHash({ topic, markets, keywords });
      const now = Date.now();
      const existing = recentHashes.get(hash);
      if (existing && (now - existing.firstAt) <= DEDUP_WINDOW_MS) {
        const stats = ensureProvider(agentId);
        stats.duplicates += 1;
        recalcScore(stats);
        return { ok: true, duplicateOf: existing.signalId };
      }
      
      const sig = {
        id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        agentId, topic,
        markets: markets.slice(0, 5),
        sourceUrl, sourceTitle, keywords, confidence
      };
      
      // Add referral URLs
      try {
        const { buildJupiterUrl } = await import('./referral.js');
        sig.markets = sig.markets.map(m => {
          if (m.slug) {
            return { ...m, jupiterUrl: buildJupiterUrl(m.slug, { signalId: sig.id, providerAgentId: agentId }) };
          }
          return m;
        });
      } catch (e) {}
      
      signals.push(sig);
      if (signals.length > MAX_SIGNALS) signals.shift();
      recentHashes.set(hash, { signalId: sig.id, topic, firstAt: now, providers: new Set([agentId]) });
      
      const stats = ensureProvider(agentId);
      stats.sent += 1;
      stats.uniqueSignals += 1;
      recalcScore(stats);
      
      return { ok: true, signalId: sig.id };
    };
    
    // Generate initial signals
    console.log('[AUTO] Generating initial signals...');
    await generateSignalsInternal(5, postSignal);
    
    // Then every 5 minutes
    setInterval(async () => {
      try {
        await generateSignalsInternal(2, postSignal);
      } catch (e) {
        console.error('[AUTO] Interval error:', e.message);
      }
    }, 5 * 60 * 1000);
    
  } catch (e) {
    console.error('[AUTO] Failed to start auto signals:', e.message);
  }
}, 5000);
