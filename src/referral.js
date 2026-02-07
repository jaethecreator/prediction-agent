/**
 * Referral & Attribution (Jupiter Ultra)
 *
 * Responsibilities:
 * - Initialize/load referral account + token accounts (off-chain setup step)
 * - Append referral params to Jupiter links
 * - Attribute swaps back to signalId / provider agent
 * - Claim fees and update balances
 */

// Placeholder config (to be filled when referral accounts are created)
export const REFERRAL = {
  projectPubKey: 'DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc', // Jupiter Ultra Referral Project
  referralAccountPubKey: process.env.JUP_REFERRAL_ACCOUNT || null,
  feeBps: parseInt(process.env.JUP_FEE_BPS || '150', 10),
};

/**
 * Build a Jupiter prediction URL with referral attribution params.
 */
export function buildJupiterUrl(predictionSlug, { signalId, providerAgentId } = {}) {
  const base = `https://jup.ag/prediction/${encodeURIComponent(predictionSlug)}`;
  const params = new URLSearchParams();
  if (signalId) params.set('sid', signalId);
  if (providerAgentId) params.set('spa', providerAgentId);
  params.set('ref', 'HUB');
  params.set('bps', String(REFERRAL.feeBps));
  return `${base}?${params.toString()}`;
}

/**
 * Record an attribution edge in our shadow ledger.
 * For now, this is a no-op stub; real impl will watch claims/txs.
 */
export function attributeSwap({ signalId, providerAgentId, amountUsd, txSig }) {
  console.log('[ATTR]', { signalId, providerAgentId, amountUsd, txSig });
  // TODO: write to DB
}

/**
 * Periodic job to claim referral fees and allocate to balances.
 * TODO: implement using @jup-ag/referral-sdk
 */
export async function claimAndDistribute() {
  console.log('claimAndDistribute() not implemented yet');
}
