/**
 * State Snapshot Format Compatibility
 *
 * tokamak-l2js 0.0.13 (old) -> 0.0.19 (new) format migration utility.
 * Existing DB data may contain old-format snapshots; this normalizes them.
 */

import type { StateSnapshot } from "tokamak-l2js";

/**
 * Normalize a state snapshot from old format to new format.
 *
 * Old format (tokamak-l2js <= 0.0.13):
 *   stateRoot: string, registeredKeys: string[], storageEntries: {k,v}[],
 *   preAllocatedLeaves: {k,v}[], contractAddress: string, channelId: number
 *
 * New format (tokamak-l2js >= 0.0.19):
 *   stateRoots: string[], registeredKeys: string[][], storageEntries: {k,v}[][],
 *   preAllocatedLeaves: {k,v}[][], entryContractAddress: string,
 *   storageAddresses: string[], channelId: number
 */
export function normalizeStateSnapshot(raw: any): StateSnapshot {
  // Already new format
  if (Array.isArray(raw.stateRoots)) {
    return raw as StateSnapshot;
  }

  // Convert old format to new
  return {
    channelId: raw.channelId,
    stateRoots: [raw.stateRoot],
    storageAddresses: [raw.contractAddress],
    registeredKeys: [raw.registeredKeys || []],
    storageEntries: [raw.storageEntries || []],
    preAllocatedLeaves: [raw.preAllocatedLeaves || []],
    entryContractAddress: raw.contractAddress,
  };
}
