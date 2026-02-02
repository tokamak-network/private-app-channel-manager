/**
 * Hook to synthesize L2 ERC20 transfer transaction
 *
 * Creates a signed ERC20 transfer transaction and calls the synthesizer API
 * to generate the L2 transaction bundle with optional ZK proof.
 */

import { useCallback } from "react";
import { StateSnapshot } from "tokamak-l2js";
import { createERC20TransferTx } from "@/lib/createERC20TransferTx";
import { bytesToHex } from "@ethereumjs/util";
import { TON_TOKEN_ADDRESS, getTokenByAddress } from "@tokamak/config";
import { parseInputAmount } from "@/lib/utils/format";

export type SynthesizeTxRequest = {
  action: "synthesize";
  channelId: string;
  channelInitTxHash: `0x${string}`;
  signedTxRlpStr: `0x${string}`;
  previousStateSnapshot: StateSnapshot;
  includeProof: boolean;
  targetContract?: `0x${string}`;
};

interface UseSynthesizerParams {
  channelId: string;
  recipient: `0x${string}` | null;
  tokenAmount: string | null;
  keySeed: `0x${string}` | null;
  includeProof: boolean;
  targetContract?: `0x${string}`;
}

interface UseSynthesizerReturn {
  synthesize: (
    initTxHash: `0x${string}`,
    previousStateSnapshot: StateSnapshot
  ) => Promise<Blob>;
  isFormValid: () => boolean;
}

/**
 * Hook to synthesize L2 ERC20 transfer transaction
 */
export function useSynthesizer({
  channelId,
  recipient,
  tokenAmount,
  keySeed,
  includeProof,
  targetContract,
}: UseSynthesizerParams): UseSynthesizerReturn {
  const isFormValid = useCallback((): boolean => {
    return (
      keySeed !== null &&
      recipient !== null &&
      tokenAmount !== null &&
      recipient.trim().length > 0 &&
      tokenAmount.trim().length > 0 &&
      !isNaN(Number(tokenAmount)) &&
      Number(tokenAmount) > 0
    );
  }, [keySeed, recipient, tokenAmount]);

  const synthesize = useCallback(
    async (
      initTxHash: `0x${string}`,
      previousStateSnapshot: StateSnapshot
    ): Promise<Blob> => {
      if (!isFormValid()) {
        throw new Error("Tx input format is not filled.");
      }

      const effectiveContract = targetContract ?? TON_TOKEN_ADDRESS;
      const tokenInfo = getTokenByAddress(effectiveContract);
      const decimals = tokenInfo?.decimals ?? 18;
      const amountInWei = parseInputAmount(tokenAmount!.trim(), decimals);

      const signedTx = await createERC20TransferTx(
        0,
        recipient!,
        amountInWei,
        keySeed!,
        effectiveContract
      );
      const signedTxStr = bytesToHex(signedTx.serialize());
      const postMessage: SynthesizeTxRequest = {
        action: "synthesize",
        channelId,
        channelInitTxHash: initTxHash,
        signedTxRlpStr: signedTxStr,
        previousStateSnapshot,
        includeProof,
        targetContract: effectiveContract,
      };

      const response = await fetch("/api/tokamak-zk-evm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postMessage),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to synthesize L2 transaction"
        );
      }

      // Response is a ZIP file blob
      return await response.blob();
    },
    [channelId, recipient, tokenAmount, keySeed, includeProof, targetContract, isFormValid]
  );

  return {
    synthesize,
    isFormValid,
  };
}
