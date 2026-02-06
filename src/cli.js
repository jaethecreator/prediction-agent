#!/usr/bin/env node
/**
 * CLI for testing market matching
 * 
 * Usage:
 *   node src/cli.js match "Trump announces new China tariffs"
 *   node src/cli.js match --url https://example.com/article
 *   echo "article text" | node src/cli.js match --stdin
 */

import OpenAI from 'openai';
import { matchContent, fetchActiveMarkets } from './market-matcher.js';

const openai = new OpenAI();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'match') {
    let content = args.slice(1).join(' ');
    
    // Check for --stdin flag
    if (args.includes('--stdin') || !content) {
      console.log('Reading from stdin...');
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      content = Buffer.concat(chunks).toString();
    }
    
    // Check for --url flag
    const urlIdx = args.indexOf('--url');
    if (urlIdx !== -1 && args[urlIdx + 1]) {
      const url = args[urlIdx + 1];
      console.log(`Fetching ${url}...`);
      const res = await fetch(url);
      content = await res.text();
      // Basic HTML stripping
      content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000);
    }
    
    if (!content.trim()) {
      console.error('No content provided. Usage: node src/cli.js match "your text here"');
      process.exit(1);
    }
    
    console.log(`\nMatching content (${content.length} chars)...\n`);
    
    const results = await matchContent(content, openai, { minScore: 15, maxResults: 5 });
    
    if (!results.length) {
      console.log('No matching markets found.');
      return;
    }
    
    console.log(`\n🎯 Found ${results.length} matching markets:\n`);
    
    for (const market of results) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📊 ${market.title}`);
      console.log(`   Score: ${market.relevanceScore} | Keywords: ${market.matchedKeywords.join(', ')}`);
      console.log(`   Volume 24h: $${formatNumber(market.volume24hr)}`);
      
      if (market.markets?.[0]) {
        const m = market.markets[0];
        const prices = JSON.parse(m.outcomePrices || '[]');
        if (prices.length >= 2) {
          console.log(`   YES: ${(prices[0] * 100).toFixed(1)}% | NO: ${(prices[1] * 100).toFixed(1)}%`);
        }
      }
      
      console.log(`   🪐 Jupiter: ${market.jupiterUrl}`);
      console.log(`   📈 Polymarket: ${market.polymarketUrl}`);
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
  } else if (command === 'markets') {
    // List active markets
    const limit = parseInt(args[1]) || 10;
    console.log(`Fetching top ${limit} markets by volume...\n`);
    
    const events = await fetchActiveMarkets(limit);
    
    for (const event of events) {
      console.log(`• ${event.title}`);
      console.log(`  Volume: $${formatNumber(event.volume24hr)} | ${event.slug}`);
    }
    
  } else if (command === 'hub') {
    // Start signal hub
    const { startHub } = await import('./signal-hub.js');
    startHub();
    
  } else {
    console.log(`
Prediction Agent CLI

Commands:
  match <text>       Match text to prediction markets
  match --url <url>  Match URL content to markets
  match --stdin      Read content from stdin
  markets [limit]    List active markets by volume
  hub                Start the signal hub server

Examples:
  node src/cli.js match "Trump announces new tariffs on China"
  node src/cli.js markets 20
  node src/cli.js hub
    `);
  }
}

function formatNumber(n) {
  const num = parseFloat(n) || 0;
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toFixed(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
