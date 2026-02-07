// Setup Jupiter Ultra Referral Account & Token Accounts
// Run locally: node scripts/setup-referral.mjs "<REFERRAL_NAME>"
// Requires: @jup-ag/referral-sdk, @solana/web3.js v1, and a Solana keypair at ~/.config/solana/id.json

import { ReferralProvider } from '@jup-ag/referral-sdk';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, sendAndConfirmRawTransaction } from '@solana/web3.js';
import fs from 'fs';

const REFERRAL_PROJECT = new PublicKey('DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc'); // Jupiter Ultra Referral Project
const NAME = process.argv[2] || 'prediction-signal-hub';

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const privateKeyArray = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/solana/id.json', 'utf8').trim());
  const wallet = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
  const provider = new ReferralProvider(connection);

  console.log('Wallet:', wallet.publicKey.toBase58());

  // 1) Initialize referral account (once)
  const init = await provider.initializeReferralAccountWithName({
    payerPubKey: wallet.publicKey,
    partnerPubKey: wallet.publicKey,
    projectPubKey: REFERRAL_PROJECT,
    name: NAME,
  });

  const info = await connection.getAccountInfo(init.referralAccountPubKey);
  if (!info) {
    const sig = await sendAndConfirmTransaction(connection, init.tx, [wallet]);
    console.log('Referral account created:', init.referralAccountPubKey.toBase58());
    console.log('Tx:', `https://solscan.io/tx/${sig}`);
  } else {
    console.log('Referral account exists:', init.referralAccountPubKey.toBase58());
  }

  // 2) Create referral token accounts for SOL and USDC (common fee mints)
  const feeMints = [
    new PublicKey('So11111111111111111111111111111111111111112'), // SOL
    new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC
  ];

  for (const mint of feeMints) {
    const tx = await provider.initializeReferralTokenAccountV2({
      payerPubKey: wallet.publicKey,
      referralAccountPubKey: init.referralAccountPubKey,
      mint,
    });

    const acc = await connection.getAccountInfo(tx.tokenAccount);
    if (!acc) {
      const sig = await sendAndConfirmTransaction(connection, tx.tx, [wallet]);
      console.log('Referral token account created for mint:', mint.toBase58());
      console.log('Tx:', `https://solscan.io/tx/${sig}`);
    } else {
      console.log('Referral token account exists for mint:', mint.toBase58());
    }
  }

  console.log('Done. Save referralAccountPubKey above and set env JUP_REFERRAL_ACCOUNT.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
