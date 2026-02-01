import {
  addHexPrefix,
  bigIntToBytes,
  concatBytes,
  createAddressFromString,
  hexToBytes,
  setLengthLeft,
} from '@ethereumjs/util';
import { Common, Mainnet } from '@ethereumjs/common';
import {
  TokamakL2Tx,
  TokamakL2TxData,
  createTokamakL2Tx,
  getEddsaPublicKey,
  poseidon,
} from 'tokamak-l2js';
import { deriveL2KeysAndAddressFromSignature } from './tokamakl2js';

const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';

const ERC20_SLOTS: Record<string, number> = {
  '0xa30fe40285b8f5c0457dbc3b7c8a280373c40044': 0, // TON
  '0x42d3b260c761cd5da022db56fe2f89c4a909b04a': 1, // USDT
  '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': 2, // USDC
};

const tokamakL2Common = new Common({
  chain: { ...Mainnet },
  customCrypto: { keccak256: poseidon, ecrecover: getEddsaPublicKey },
});

export async function createERC20TransferTx(
  nonce: number,
  recipient: `0x${string}`,
  amount: bigint,
  keySeed: `0x${string}`,
  tokenAddress: `0x${string}`
): Promise<TokamakL2Tx> {
  const normalizedToken = tokenAddress.toLowerCase();
  const slot = ERC20_SLOTS[normalizedToken] ?? 0;

  const account = deriveL2KeysAndAddressFromSignature(keySeed, slot);

  const calldata = concatBytes(
    setLengthLeft(hexToBytes(ERC20_TRANSFER_SELECTOR), 4),
    setLengthLeft(hexToBytes(recipient), 32),
    setLengthLeft(bigIntToBytes(amount), 32)
  );

  const transactionData: TokamakL2TxData = {
    nonce: BigInt(nonce),
    to: createAddressFromString(tokenAddress),
    data: calldata,
    senderPubKey: hexToBytes(account.publicKey),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unsignedTransaction = createTokamakL2Tx(transactionData, {
    common: tokamakL2Common as any,
  });

  return unsignedTransaction.sign(hexToBytes(addHexPrefix(account.privateKey)));
}

export function serializeTx(tx: TokamakL2Tx): string {
  return addHexPrefix(Buffer.from(tx.serialize()).toString('hex'));
}
