import {
  deriveL2AddressFromKeys,
  deriveL2KeysFromSignature,
  deriveL2MptKeyFromAddress,
  L2_PRV_KEY_MESSAGE,
} from 'tokamak-l2js';
import { bytesToHex } from '@ethereumjs/util';

export { L2_PRV_KEY_MESSAGE };

export type DerivedL2Account = {
  privateKey: `0x${string}`;
  publicKey: `0x${string}`;
  l2Address: `0x${string}`;
  mptKey: `0x${string}`;
};

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

export const deriveMultipleMptKeysFromSignature = (
  signature: `0x${string}`,
  numSlots: number
): `0x${string}`[] => {
  const keys = deriveL2KeysFromSignature(signature);
  const address = deriveL2AddressFromKeys(keys);

  const mptKeys: `0x${string}`[] = [];
  for (let slotIndex = 0; slotIndex < numSlots; slotIndex++) {
    const mptKey = deriveL2MptKeyFromAddress(address, slotIndex);
    mptKeys.push(mptKey);
  }

  return mptKeys;
};
