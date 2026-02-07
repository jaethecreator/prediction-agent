/**
 * Simple file-based persistence for signals and provider stats
 * Uses a JSON file that survives restarts (within the same container volume)
 */

import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || '/tmp/signal-hub-data';
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const PROVIDERS_FILE = path.join(DATA_DIR, 'providers.json');

// Ensure data directory exists
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {}

function safeRead(file, defaultVal) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`[PERSIST] Read error ${file}:`, e.message);
  }
  return defaultVal;
}

function safeWrite(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data), 'utf8');
  } catch (e) {
    console.error(`[PERSIST] Write error ${file}:`, e.message);
  }
}

// Load signals array
export function loadSignals() {
  return safeRead(SIGNALS_FILE, []);
}

// Save signals array
export function saveSignals(signals) {
  // Keep only last 500 to avoid file bloat
  const trimmed = signals.slice(-500);
  safeWrite(SIGNALS_FILE, trimmed);
}

// Load provider stats (Map serialized as object)
export function loadProviderStats() {
  const obj = safeRead(PROVIDERS_FILE, {});
  return new Map(Object.entries(obj));
}

// Save provider stats
export function saveProviderStats(statsMap) {
  const obj = Object.fromEntries(statsMap);
  safeWrite(PROVIDERS_FILE, obj);
}

// Debounced save (call frequently, writes less often)
let signalsSaveTimeout = null;
let providersSaveTimeout = null;

export function debouncedSaveSignals(signals, delayMs = 5000) {
  if (signalsSaveTimeout) clearTimeout(signalsSaveTimeout);
  signalsSaveTimeout = setTimeout(() => saveSignals(signals), delayMs);
}

export function debouncedSaveProviders(statsMap, delayMs = 5000) {
  if (providersSaveTimeout) clearTimeout(providersSaveTimeout);
  providersSaveTimeout = setTimeout(() => saveProviderStats(statsMap), delayMs);
}

export default { 
  loadSignals, saveSignals, debouncedSaveSignals,
  loadProviderStats, saveProviderStats, debouncedSaveProviders 
};
