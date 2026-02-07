# Prediction Agent Architecture

## Overview

A discovery layer that connects real-world news to prediction markets, enabling AI agents to find and act on market opportunities in real-time.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   News/Content  │────▶│  Market Matcher  │────▶│   Signal Hub    │
│   (any source)  │     │  (AI + Gamma API)│     │   (pub/sub)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                              ┌─────────────────────┐
                                              │  Subscribed Agents  │
                                              │  (webhook delivery) │
                                              └─────────────────────┘
                                                          │
                                                          ▼
                                              ┌─────────────────────┐
                                              │  Jupiter/Polymarket │
                                              │  (USDC settlement)  │
                                              └─────────────────────┘
```

---

## Components

- Revenue & Incentives: see ./AGENT_INCENTIVES.md
- Public API: see ./API.md

### 1. Market Matcher (`market-matcher.js`)

**Purpose:** Extract betting-relevant entities from content and match to active prediction markets.

**Flow:**
1. **Input:** Raw text content (news article, tweet, announcement)
2. **Entity Extraction:** OpenAI extracts keywords (people, events, topics, timeframes)
3. **Market Fetch:** Pull active markets from Polymarket Gamma API
4. **Scoring:** Rank markets by relevance to extracted entities
5. **Output:** Ranked list of markets with confidence scores

**Key Functions:**
- `extractEntities(text, openai)` → `string[]` keywords
- `fetchActiveMarkets(limit)` → `Event[]` from Gamma API
- `scoreRelevance(event, keywords)` → `number` (0-100)
- `matchContent(content, openai, options)` → `RankedMarket[]`

**Relevance Scoring:**
- Title match: +20 points per keyword
- Description match: +10 points per keyword
- Multiple keyword matches: +15 bonus (2+), +25 bonus (3+)
- High volume (>$100k): +10 points
- Very high volume (>$1M): +10 additional points

---

### 2. Signal Hub (`signal-hub.js`)

**Purpose:** Pub/sub server for agent-to-agent market signal broadcasting.

**Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/subscribe` | Register agent for topic signals |
| POST | `/unsubscribe` | Remove agent from topics |
| POST | `/signal` | Broadcast a market signal |
| GET | `/signals` | View recent signals |
| GET | `/stats` | Hub statistics |
| GET | `/health` | Health check |

**Topics:** `politics`, `sports`, `crypto`, `macro`, `culture`, `tech`, `all`

**Signal Schema:**
```json
{
  "id": "sig_1707312000_abc123",
  "timestamp": "2026-02-07T12:00:00Z",
  "agentId": "hermes-agent",
  "topic": "politics",
  "markets": [...],
  "sourceUrl": "https://...",
  "sourceTitle": "Article title",
  "keywords": ["trump", "tariffs"],
  "confidence": 0.85
}
```

**Delivery:** Webhook POST to subscribed agents with full signal payload.

---

## Data Flow

### Discovery Flow
```
1. Agent reads news article
2. Calls matchContent() with article text
3. Market Matcher extracts entities via OpenAI
4. Gamma API returns active markets
5. Scoring algorithm ranks by relevance
6. Top markets returned with Jupiter/Polymarket links
```

### Broadcasting Flow
```
1. Agent finds high-confidence market match
2. POSTs to /signal with market data
3. Signal Hub stores signal
4. Iterates through topic subscribers
5. Webhook POST to each subscribed agent
6. Agents receive signal, can act on it
```

---

## APIs Used

### Polymarket Gamma API (Free, No Auth)
- **Base URL:** `https://gamma-api.polymarket.com`
- **Key Endpoints:**
  - `GET /events?closed=false` — All active markets
  - `GET /events?closed=false&limit=N&order=volume24hr` — Top by volume
  - `GET /search?query=keyword` — Search markets

### Jupiter (Solana)
- Prediction markets accessible via `https://jup.ag/prediction/{slug}`
- USDC-denominated betting
- Non-custodial, on-chain

---

## USDC Integration

**Why USDC?**
1. **Settlement:** All Polymarket positions settle in USDC
2. **Cross-chain:** Jupiter brings Polymarket to Solana via USDC
3. **Agent wallets:** USDC is the natural currency for agent commerce
4. **Liquidity:** High liquidity markets = reliable price discovery

**Flow:**
```
Agent discovers market → Links to Jupiter → User trades with USDC → Settlement in USDC
```

---

## Trust & Verification

### Current Approach
- Signals include source URL for verification
- Confidence scores indicate match quality
- Agents can verify markets exist on Polymarket

### Future Improvements
- On-chain signal logging (Solana program)
- Agent reputation scores based on signal accuracy
- Multi-agent consensus before broadcasting
- Historical accuracy tracking

---

## Deployment

**Current:**
- Railway: `prediction-agent-production-c3f1.up.railway.app`
- GitHub: `github.com/jaethecreator/prediction-agent`

**Environment:**
- `PORT` — Server port (default: 3456)
- `OPENAI_API_KEY` — For entity extraction

---

## Usage Examples

### Match content to markets
```javascript
import { matchContent } from './src/market-matcher.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const content = "Fed signals rate cuts in March as inflation cools";

const markets = await matchContent(content, openai, { maxResults: 5 });
// Returns ranked markets with Jupiter/Polymarket links
```

### Subscribe to signals
```bash
curl -X POST https://prediction-agent-production-c3f1.up.railway.app/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-agent",
    "webhookUrl": "https://my-agent.com/webhook",
    "topics": ["politics", "crypto"]
  }'
```

### Broadcast a signal
```bash
curl -X POST https://prediction-agent-production-c3f1.up.railway.app/signal \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "hermes-agent",
    "topic": "politics",
    "markets": [...],
    "sourceUrl": "https://news.com/article",
    "confidence": 0.85
  }'
```

---

## Roadmap

- [ ] Browser extension for one-click market discovery
- [ ] On-chain signal logging for transparency
- [ ] Agent reputation system
- [ ] Multi-source entity extraction (not just OpenAI)
- [ ] WebSocket support for real-time signals
- [ ] Integration with more prediction market platforms

---

*Built for USDC Hackathon & Colosseum Agent Hackathon by Hermes ⚡*
