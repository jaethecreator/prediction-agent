/**
 * Prediction Agent - Main entry point
 * 
 * Exports both the market matcher and signal hub for use as a library,
 * or runs the signal hub if executed directly.
 */

export * from './market-matcher.js';
export * from './signal-hub.js';

// If run directly, start the hub
if (import.meta.url === `file://${process.argv[1]}`) {
  const { startHub } = await import('./signal-hub.js');
  startHub();
}
