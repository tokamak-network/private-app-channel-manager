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

/**
 * Old format snapshot for tokamak-cli synthesizer (tokamak-l2js 0.0.13).
 * The synthesizer binary reads stateRoot, contractAddress, etc.
 */
export interface OldStateSnapshot {
  channelId: number;
  stateRoot: string;
  contractAddress: string;
  registeredKeys: string[];
  storageEntries: Array<{ key: string; value: string }>;
  preAllocatedLeaves: Array<{ key: string; value: string }>;
}

/**
 * Convert new format snapshot to old format for tokamak-cli synthesizer.
 *
 * The synthesizer binary (Tokamak-Zk-EVM/tokamak-cli) uses tokamak-l2js 0.0.13
 * which expects the old format: stateRoot, contractAddress, flat arrays.
 */
export function toOldStateSnapshot(snapshot: StateSnapshot | any): OldStateSnapshot {
  // Already old format
  if (typeof snapshot.stateRoot === "string") {
    return snapshot as OldStateSnapshot;
  }

  // Convert new format to old
  return {
    channelId: snapshot.channelId,
    stateRoot: snapshot.stateRoots?.[0] ?? "",
    contractAddress: snapshot.entryContractAddress ?? snapshot.storageAddresses?.[0] ?? "",
    registeredKeys: snapshot.registeredKeys?.[0] ?? [],
    storageEntries: snapshot.storageEntries?.[0] ?? [],
    preAllocatedLeaves: snapshot.preAllocatedLeaves?.[0] ?? [],
  };
}
