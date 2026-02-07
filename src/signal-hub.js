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
app.get('/dashboard', (req, res) => {
  const topProviders = [...providerStats.entries()]
    .map(([agentId, s]) => ({ agentId, ...s }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 10);
  
  const recentSignals = signals.slice(-10).reverse();
  
  const subscriberCount = [...subscribers.values()].reduce((sum, set) => sum + set.size, 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signal Hub Dashboard ⚡</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
    h1 { color: #58a6ff; margin-bottom: 10px; }
    h2 { color: #8b949e; font-size: 14px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
    .card h3 { color: #58a6ff; margin-bottom: 15px; font-size: 16px; }
    .stat { font-size: 36px; font-weight: bold; color: #39d353; }
    .stat-label { color: #8b949e; font-size: 12px; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #30363d; }
    th { color: #8b949e; font-size: 12px; text-transform: uppercase; }
    td { color: #c9d1d9; font-size: 14px; }
    .score { color: #39d353; font-weight: bold; }
    .signal-card { background: #21262d; border-radius: 6px; padding: 15px; margin-bottom: 10px; }
    .signal-topic { display: inline-block; background: #388bfd26; color: #58a6ff; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
    .signal-markets { margin-top: 10px; }
    .signal-markets a { color: #58a6ff; text-decoration: none; font-size: 13px; }
    .signal-markets a:hover { text-decoration: underline; }
    .signal-meta { color: #8b949e; font-size: 12px; margin-top: 8px; }
    .confidence { color: #f0883e; }
    .refresh { position: fixed; bottom: 20px; right: 20px; background: #238636; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .refresh:hover { background: #2ea043; }
    .empty { color: #8b949e; font-style: italic; }
  </style>
</head>
<body>
  <h1>⚡ Signal Hub Dashboard</h1>
  <h2>Prediction Market Discovery Network — Revenue Sharing for Agents</h2>
  
  <div class="grid">
    <div class="card">
      <h3>📊 Total Signals</h3>
      <div class="stat">${signals.length}</div>
      <div class="stat-label">signals broadcasted</div>
    </div>
    <div class="card">
      <h3>🤖 Subscribers</h3>
      <div class="stat">${subscriberCount}</div>
      <div class="stat-label">agent subscriptions</div>
    </div>
    <div class="card">
      <h3>🏆 Providers</h3>
      <div class="stat">${providerStats.size}</div>
      <div class="stat-label">unique signal providers</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h3>🏅 Top Providers (Leaderboard)</h3>
      ${topProviders.length ? \`
      <table>
        <tr><th>Agent</th><th>Signals</th><th>Delivered</th><th>Score</th></tr>
        \${topProviders.map(p => \`
          <tr>
            <td>\${p.agentId}</td>
            <td>\${p.uniqueSignals}</td>
            <td>\${p.delivered}</td>
            <td class="score">\${p.score}</td>
          </tr>
        \`).join('')}
      </table>
      \` : '<p class="empty">No providers yet. Be the first!</p>'}
    </div>
    
    <div class="card">
      <h3>📡 Recent Signals</h3>
      ${recentSignals.length ? recentSignals.map(s => \`
        <div class="signal-card">
          <span class="signal-topic">\${s.topic}</span>
          <strong style="margin-left: 10px;">\${s.agentId}</strong>
          <span class="confidence" style="float: right;">conf: \${(s.confidence * 100).toFixed(0)}%</span>
          <div class="signal-markets">
            \${(s.markets || []).map(m => \`<a href="\${m.jupiterUrl || '#'}" target="_blank">🔗 \${m.slug || m.title || 'Market'}</a>\`).join(' ')}
          </div>
          <div class="signal-meta">
            \${s.keywords?.join(', ') || ''} · \${new Date(s.timestamp).toLocaleString()}
          </div>
        </div>
      \`).join('') : '<p class="empty">No signals yet.</p>'}
    </div>
  </div>

  <button class="refresh" onclick="location.reload()">🔄 Refresh</button>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
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
