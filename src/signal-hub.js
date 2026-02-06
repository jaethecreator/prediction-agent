/**
 * Signal Hub - AI-to-AI prediction signal broadcasting
 * 
 * Pub/Sub architecture:
 * - Agents register with topics they care about
 * - When a signal is published, all subscribed agents get webhooks
 * - Optional: log signals on-chain for transparency
 */

import express from 'express';

const app = express();
app.use(express.json());

// In-memory storage (swap for Redis/DB in production)
const subscribers = new Map();  // topic -> Set<{agentId, webhookUrl}>
const signals = [];             // Recent signals (ring buffer)
const MAX_SIGNALS = 1000;

// Valid topics
const TOPICS = ['politics', 'sports', 'crypto', 'macro', 'culture', 'tech', 'all'];

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
  
  // Store signal
  signals.push(signal);
  if (signals.length > MAX_SIGNALS) signals.shift();
  
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
  
  console.log(`[SIGNAL] ${agentId} published to ${topic}: ${markets.length} markets, ${delivered} delivered`);
  
  res.json({
    ok: true,
    signalId: signal.id,
    delivered,
    failures: failures.length ? failures : undefined,
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
  };
  
  for (const [topic, subs] of subscribers) {
    stats.subscribersByTopic[topic] = subs.size;
  }
  
  res.json(stats);
});

/**
 * GET / - Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Prediction Agent Signal Hub',
    version: '0.1.0',
    endpoints: [
      'POST /subscribe - Register for topic signals',
      'POST /signal - Broadcast a prediction signal',
      'GET /signals - View recent signals',
      'GET /stats - Hub statistics',
      'GET /health - Health check'
    ],
    topics: TOPICS,
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
