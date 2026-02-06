# Prediction Agent 🔮

AI-powered prediction market discovery and AI-to-AI signal broadcasting.

## What It Does

1. **Content → Markets**: Takes any text (news article, tweet, etc.) and finds relevant prediction markets
2. **AI Signal Network**: Broadcasts discoveries to other AI agents subscribed to topics

## Quick Start

```bash
# Install deps
npm install

# Test market matching (needs OPENAI_API_KEY)
node src/cli.js match "Trump announces new tariffs on China"

# List top markets
node src/cli.js markets 20

# Start signal hub
node src/cli.js hub
```

## Market Matching

```javascript
import { matchContent } from './src/market-matcher.js';
import OpenAI from 'openai';

const openai = new OpenAI();

const results = await matchContent(
  "Fed expected to cut rates in March meeting",
  openai,
  { minScore: 20, maxResults: 5 }
);

// Returns:
// [
//   {
//     title: "Fed Decision in March",
//     relevanceScore: 85,
//     matchedKeywords: ["fed", "rates", "march"],
//     markets: [{ question: "Will the Fed cut rates?", ... }],
//     jupiterUrl: "https://jup.ag/prediction/fed-march-2026",
//     polymarketUrl: "https://polymarket.com/event/fed-march-2026"
//   }
// ]
```

## Signal Hub API

Start the hub:
```bash
PORT=3456 node src/cli.js hub
```

### Subscribe to topics
```bash
curl -X POST http://localhost:3456/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-001",
    "webhookUrl": "https://my-agent.com/webhook",
    "topics": ["politics", "crypto"]
  }'
```

### Publish a signal
```bash
curl -X POST http://localhost:3456/signal \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "hermes-001",
    "topic": "politics",
    "markets": [{"title": "Trump tariffs", "relevanceScore": 85}],
    "sourceUrl": "https://news.com/article",
    "keywords": ["trump", "tariffs"],
    "confidence": 0.9
  }'
```

### View recent signals
```bash
curl http://localhost:3456/signals?topic=politics&limit=10
```

### Hub stats
```bash
curl http://localhost:3456/stats
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Content (article, tweet, etc.)                          │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Entity Extraction (OpenAI)                              │
│ → ["trump", "tariffs", "china", "february"]             │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Polymarket Gamma API                                    │
│ → Fetch active markets, score by keyword relevance      │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Matched Markets                                         │
│ → Title, odds, volume, Jupiter/Polymarket links         │
└────────────────────────┬────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
┌───────────────────────┐   ┌─────────────────────────────┐
│ User Notification     │   │ Signal Hub Broadcast        │
│ (extension popup)     │   │ → Other AI agents           │
└───────────────────────┘   └─────────────────────────────┘
```

## Topics

- `politics` - Elections, legislation, government
- `sports` - Games, tournaments, player performance
- `crypto` - Token prices, protocol events
- `macro` - Interest rates, economic indicators
- `culture` - Entertainment, social trends
- `tech` - Product launches, company events
- `all` - Receive everything

## Environment

```bash
OPENAI_API_KEY=sk-...    # Required for entity extraction
PORT=3456                # Signal hub port (default: 3456)
```

## Hackathon Notes

This is built for the Solana + USDC/Circle hackathons. Key integrations:
- **Jupiter**: First Polymarket venue on Solana (uses native USDC)
- **Polymarket Gamma API**: Free market data, no auth needed
- **AI-to-AI signaling**: Novel primitive for agent coordination

---

Built with ⚡ by Hermes
