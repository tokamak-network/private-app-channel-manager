/**
 * Shared State Utility for E2E Tests
 *
 * Manages state sharing between test files via a JSON file.
 * Used to pass channelId, participant addresses, etc. across test runs.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SharedState {
  channelId: string | null;
  leaderAddress: string | null;
  participantAddresses: string[];
  createdAt?: number;
  depositedAt?: number;
  initializedAt?: number;
  transactionAt?: number;
  proofSubmittedAt?: number;
  closedAt?: number;
  withdrawnAt?: number;
}

const STATE_FILE = path.resolve(__dirname, '../shared-state.json');

const DEFAULT_STATE: SharedState = {
  channelId: null,
  leaderAddress: null,
  participantAddresses: [],
};

/**
 * Save state to shared-state.json
 */
export function saveState(data: Partial<SharedState>): SharedState {
  const current = loadState();
  const merged: SharedState = { ...current, ...data };
  fs.writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2));
  console.log('[SharedState] Saved:', JSON.stringify(merged, null, 2));
  return merged;
}

/**
 * Load state from shared-state.json
 */
export function loadState(): SharedState {
  if (!fs.existsSync(STATE_FILE)) {
    return { ...DEFAULT_STATE };
  }
  try {
    const content = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(content) as SharedState;
  } catch {
    console.warn('[SharedState] Failed to parse state file, returning default');
    return { ...DEFAULT_STATE };
  }
}

/**
 * Clear shared state file
 */
export function clearState(): void {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
    console.log('[SharedState] Cleared');
  }
}
