/**
 * MPT Key Generation Utilities
 *
 * This module provides utilities for generating MPT keys that match
 * the on-chain deposit process.
 *
 * Note: These functions run in the browser (client-side) to match
 * the original manager app implementation.
 * Uses tokamak-l2js npm package (dev branch code migrated to package).
 */
import {
  deriveL2AddressFromKeys,
  deriveL2KeysFromSignature,
  deriveL2MptKeyFromAddress,
} from "tokamak-l2js";
import { bytesToHex } from "@ethereumjs/util";

export type DerivedL2Account = {
  privateKey: `0x${string}`;
  publicKey: `0x${string}`;
  l2Address: `0x${string}`;
  mptKey: `0x${string}`;
};

/**
 * Derive L2 MPT key from signature and slot index
 */
export const deriveL2MptKeyFromSignature = (
  signature: `0x${string}`,
  slotIndex: number
): `0x${string}` => {
  const keys = deriveL2KeysFromSignature(signature);
  const address = deriveL2AddressFromKeys(keys);
  return deriveL2MptKeyFromAddress(address, slotIndex);
};

/**
 * Derive L2 keys, address, and MPT key from signature and slot index
 */
export const deriveL2KeysAndAddressFromSignature = (
  signature: `0x${string}`,
  slotIndex: number
): DerivedL2Account => {
  const keys = deriveL2KeysFromSignature(signature);
  const address = deriveL2AddressFromKeys(keys);
  const mptKey = deriveL2MptKeyFromAddress(address, slotIndex);

  return {
    privateKey: bytesToHex(keys.privateKey),
    publicKey: bytesToHex(keys.publicKey),
    l2Address: address,
    mptKey,
  };
};

/**
 * Derive multiple MPT keys from a single signature for multi-token support
 * @param signature - The wallet signature
 * @param slotOffsets - Array of actual Solidity storage slot numbers (e.g., [2, 6] for USDT)
 *                      These must match the EVM bytecode's storage layout so that
 *                      poseidon(l2Address, slotOffset) matches the SLOAD key computation.
 * @returns Array of MPT keys for each slot
 */
export const deriveMultipleMptKeysFromSignature = (
  signature: `0x${string}`,
  slotOffsets: number[]
): `0x${string}`[] => {
  const keys = deriveL2KeysFromSignature(signature);
  const address = deriveL2AddressFromKeys(keys);

  const mptKeys: `0x${string}`[] = [];
  for (const slotOffset of slotOffsets) {
    const mptKey = deriveL2MptKeyFromAddress(address, slotOffset);
    mptKeys.push(mptKey);
  }

  return mptKeys;
};

/**
 * Extended L2 account info with multiple MPT keys for multi-token support
 */
export type DerivedL2AccountMultiSlot = {
  privateKey: `0x${string}`;
  publicKey: `0x${string}`;
  l2Address: `0x${string}`;
  mptKeys: `0x${string}`[];
};

/**
 * Derive L2 keys, address, and multiple MPT keys from signature for multi-token support
 * @param signature - The wallet signature
 * @param slotOffsets - Array of actual Solidity storage slot numbers (e.g., [2, 6] for USDT)
 *                      These must match the EVM bytecode's storage layout so that
 *                      poseidon(l2Address, slotOffset) matches the SLOAD key computation.
 * @returns L2 account info with array of MPT keys
 */
export const deriveL2AccountWithMultipleMptKeys = (
  signature: `0x${string}`,
  slotOffsets: number[]
): DerivedL2AccountMultiSlot => {
  const keys = deriveL2KeysFromSignature(signature);
  const address = deriveL2AddressFromKeys(keys);

  const mptKeys: `0x${string}`[] = [];
  for (const slotOffset of slotOffsets) {
    const mptKey = deriveL2MptKeyFromAddress(address, slotOffset);
    mptKeys.push(mptKey);
  }

  return {
    privateKey: bytesToHex(keys.privateKey),
    publicKey: bytesToHex(keys.publicKey),
    l2Address: address,
    mptKeys,
  };
};
