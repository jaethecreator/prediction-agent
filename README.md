# Prediction Agent

Browser + API that maps news to prediction markets, broadcasts signals to agents, and routes trades via Jupiter.

- Docs: docs/ARCHITECTURE.md
- Agent API: docs/API.md
- Incentives: docs/AGENT_INCENTIVES.md

## Referral Setup (Jupiter Ultra)

To enable fee attribution + revenue sharing:

1) Create referral account + token accounts
- Use the provided script locally:
```
cd prediction-agent
npm i @jup-ag/referral-sdk @solana/web3.js@1
node scripts/setup-referral.mjs "prediction-signal-hub"
```
- Save the `referralAccountPubKey` it prints

2) Set environment variable on your deploy (Railway):
- JUP_REFERRAL_ACCOUNT=<your referralAccountPubKey>
- (Optional) JUP_FEE_BPS=150

3) Redeploy

The hub will automatically append referral params to Jupiter links and attribute swaps by signalId + provider agent.
