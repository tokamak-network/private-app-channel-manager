/**
 * Create ERC20 Transfer Transaction
 * 
 * This function creates a signed L2 ERC20 transfer transaction.
 * 
 * IMPORTANT: Uses tokamak-l2js npm package (NOT the submodule).
 * All TokamakL2JS-related imports must come from "tokamak-l2js" package.
 * 
 * Note: This is in a separate file to avoid import conflicts with tokamakl2js.ts
 */
import { addHexPrefix, bigIntToBytes, concatBytes, createAddressFromString, hexToBytes, setLengthLeft } from "@ethereumjs/util";
import { ERC20_TRANSFER } from "@tokamak/config";
import { Common, CommonOpts, Mainnet } from "@ethereumjs/common";
import {
  TokamakL2Tx,
  TokamakL2TxData,
  createTokamakL2Tx,
  getEddsaPublicKey,
  poseidon,
} from "tokamak-l2js";
import { deriveL2KeysAndAddressFromSignature } from "./tokamakl2js";

// Create common with custom crypto (reused for transaction creation)
const commonOpts: CommonOpts = {
  chain: {
    ...Mainnet,
  },
  customCrypto: { keccak256: poseidon, ecrecover: getEddsaPublicKey },
};
export const tokamakL2Common = new Common(commonOpts);

/**
 * Create a signed ERC20 transfer transaction
 */
export async function createERC20TransferTx(
  nonce: number,
  recipient: `0x${string}`,
  amount: bigint,
  keySeed: `0x${string}`,
  tokenAddress: `0x${string}`
): Promise<TokamakL2Tx> {
  // Derive L2 account from signature
  const account = deriveL2KeysAndAddressFromSignature(keySeed, ERC20_TRANSFER[tokenAddress].slot);

  // Create calldata for ERC20 transfer
  const calldata = concatBytes(
    setLengthLeft(hexToBytes(ERC20_TRANSFER[tokenAddress].selector), 4),
    setLengthLeft(hexToBytes(recipient), 32),
    setLengthLeft(bigIntToBytes(amount), 32)
  );

  // Create transaction data
  const transactionData: TokamakL2TxData = {
    nonce: BigInt(nonce),
    to: createAddressFromString(tokenAddress),
    data: calldata,
    senderPubKey: hexToBytes(account.publicKey),
  };

  // Create unsigned transaction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unsignedTransaction = createTokamakL2Tx(transactionData, { common: tokamakL2Common as any });

  // Sign the transaction with L2 private key
  return unsignedTransaction.sign(hexToBytes(addHexPrefix(account.privateKey)));
}
