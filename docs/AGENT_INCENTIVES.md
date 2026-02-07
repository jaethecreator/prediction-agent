# Agent Incentive Model (Revenue Sharing)

Goal: Make it irresistible for agent owners to connect to our Signal Hub by letting their agents earn USDC passively.

## Roles
- Signal Provider Agent (SPA): Publishes signals derived from content/news.
- Signal Consumer Agent (SCA): Subscribes to signals and optionally trades on them.
- Hub: Routes signals and referral-enabled trade links; accounts for attribution and payouts.

## Revenue Sources
- Jupiter Ultra Referral Program: 50–255 bps on swap notional. Jupiter takes 20% cut of integrator fees; we keep 80%.
- Optional: Premium API tier for higher rate limits/priority signals.

## Split
- Default referral fee: 150 bps (1.50%) per executed swap via our routed links.
- Split: 50% SPA / 50% Hub (post-Jupiter cut) initially. Example at 150 bps:
  - Gross: 150 bps
  - Jupiter cut (20%): 30 bps
  - Net to distribute: 120 bps
  - SPA: 60 bps
  - Hub: 60 bps

Notes:
- Split configurable per partner or campaign.
- We can allocate part of Hub share to SCAs in future (e.g., 10% rebate).

## Attribution
- Each signal gets a stable signalId.
- All referral URLs include: `?ref=HUB&sid=<signalId>&spa=<providerAgentId>`.
- Trades executed via Jupiter Ultra API include our referral accounts; fees accrue on-chain to referral token accounts.
- We maintain a shadow ledger mapping signalId -> accrued fees (by block/tx) using Jupiter referral SDK events + periodic claims.

## Anti-Gaming & Quality
- Provider reputation score: win-rate, click→trade conversion, complaint rate.
- Rate limits and visibility boost based on reputation.
- Deduplication: identical signals within window merge; payout pro-rated if multiple identical SPAs.
- Manual slashing for clear manipulation; appeals process.

## Owner Value Props
- “Your agent earned $X this week” dashboard.
- Public leaderboard of top-earning agents (opt-in to display name/logo).
- Weekly distributions in USDC to owner wallet; claimable UI + on-chain proof links.

## Technical Flow
1) SPA → POST /signal with matched markets + metadata
2) Hub → Broadcast to SCAs (webhooks)
3) SCAs (or humans) click Jupiter link with referral params
4) Swap settles → Jupiter accrues fees to our referral token accounts
5) Hub cron claims fees, attributes to signalId/SPA, updates balances
6) Weekly payout job distributes USDC to owners’ wallets

## Open Items
- Create Jupiter referral account + token accounts (needs Solana wallet)
- Add referral params to generated Jupiter URLs
- Implement attribution + payout jobs
- Terms of service for SPAs/SCAs
