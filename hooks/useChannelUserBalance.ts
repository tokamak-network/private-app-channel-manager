/**
 * useChannelUserBalance Hook
 * 
 * Shared hook for fetching user's channel balance.
 * - First tries to get balance from latest verified proof's state_snapshot
 * - Falls back to on-chain initial deposit if no verified proofs exist
 * 
 * Used by: AccountPanel, Transaction page (AmountInput)
 */

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { isValidBytes32 } from "@/lib/channelId";
import { useBridgeCoreRead } from "@/hooks/contract";
import { useBalanceSlotIndex } from "@/hooks/useBalanceSlotIndex";
import { getTokenByAddress } from "@tokamak/config";
import JSZip from "jszip";

interface StateSnapshot {
  storageEntries?: Array<{ key: string; value: string }>;
}

interface ChannelUserBalanceResult {
  /** Raw balance in wei (bigint) */
  balance: bigint | null;
  /** Formatted balance string (e.g., "100.00") */
  balanceFormatted: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Whether balance is from verified proof (true) or initial deposit (false) */
  isFromProof: boolean;
  /** Proof number if from verified proof, null otherwise */
  proofNumber: number | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

interface UseChannelUserBalanceParams {
  channelId: string | null;
  mptKey: string | null;
  decimals?: number;
  /** Token address to determine correct slot index (default: TON = slot 0) */
  tokenAddress?: string | null;
}

export function useChannelUserBalance({
  channelId,
  mptKey,
  decimals = 18,
  tokenAddress,
}: UseChannelUserBalanceParams): ChannelUserBalanceResult {
  const { address } = useAccount();
  
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isFromProof, setIsFromProof] = useState(false);
  const [proofNumber, setProofNumber] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get slot index from contract (TON=0, USDT=1, USDC=2)
  const { slotIndex, isLoading: isLoadingSlotIndex } = useBalanceSlotIndex({
    targetContract: tokenAddress,
  });

  const { data: initialDeposit, isLoading: isLoadingDeposit } = useBridgeCoreRead({
    functionName: "getValidatedUserSlotValue",
    args:
      channelId && address && isValidBytes32(channelId) && slotIndex !== undefined
        ? [channelId as `0x${string}`, address, slotIndex]
        : undefined,
    query: {
      enabled: !!channelId && !!address && isValidBytes32(channelId) && slotIndex !== undefined,
    },
  });

  const fetchBalance = useCallback(async () => {
    if (!channelId || !isValidBytes32(channelId) || !mptKey) {
      setBalance(null);
      setIsFromProof(false);
      setProofNumber(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const normalizedChannelId = channelId.toLowerCase();
      const encodedChannelId = encodeURIComponent(normalizedChannelId);

      // Fetch verified proofs
      const proofsResponse = await fetch(
        `/api/channels/${encodedChannelId}/proofs?type=verified`
      );

      if (!proofsResponse.ok) {
        // No verified proofs - use initial deposit
        if (initialDeposit !== undefined) {
          setBalance(initialDeposit as bigint);
          setIsFromProof(false);
          setProofNumber(null);
        } else {
          setBalance(null);
        }
        return;
      }

      const proofsData = await proofsResponse.json();
      if (!proofsData.success || !proofsData.data) {
        // No verified proofs - use initial deposit
        if (initialDeposit !== undefined) {
          setBalance(initialDeposit as bigint);
          setIsFromProof(false);
          setProofNumber(null);
        } else {
          setBalance(null);
        }
        return;
      }

      // Get proofs array
      let proofsArray: Array<{ key: string; sequenceNumber: number }> = [];
      if (Array.isArray(proofsData.data)) {
        proofsArray = proofsData.data;
      } else if (proofsData.data && typeof proofsData.data === "object") {
        proofsArray = Object.entries(proofsData.data).map(
          ([key, value]: [string, any]) => ({ key, ...value })
        );
      }

      if (proofsArray.length === 0) {
        // No verified proofs - use initial deposit
        if (initialDeposit !== undefined) {
          setBalance(initialDeposit as bigint);
          setIsFromProof(false);
          setProofNumber(null);
        } else {
          setBalance(null);
        }
        return;
      }

      // Sort by sequence number (descending) to get latest
      proofsArray.sort((a, b) => (b.sequenceNumber || 0) - (a.sequenceNumber || 0));
      const latestProof = proofsArray[0];

      // Load the proof ZIP file
      const zipApiUrl = `/api/get-proof-zip?channelId=${encodeURIComponent(
        normalizedChannelId
      )}&proofId=${encodeURIComponent(latestProof.key)}&status=verifiedProofs&format=binary`;

      const zipResponse = await fetch(zipApiUrl);

      if (!zipResponse.ok) {
        // Failed to load proof - use initial deposit as fallback
        if (initialDeposit !== undefined) {
          setBalance(initialDeposit as bigint);
          setIsFromProof(false);
          setProofNumber(null);
        } else {
          setBalance(null);
        }
        return;
      }

      const zipBlob = await zipResponse.blob();
      const zipArrayBuffer = await zipBlob.arrayBuffer();
      const zip = await JSZip.loadAsync(zipArrayBuffer);

      // Find and parse state_snapshot.json
      let stateSnapshotJson: string | null = null;
      const files = Object.keys(zip.files);
      for (const filePath of files) {
        const fileName = filePath.split("/").pop()?.toLowerCase();
        if (fileName === "state_snapshot.json") {
          const file = zip.file(filePath);
          if (file) {
            stateSnapshotJson = await file.async("string");
            break;
          }
        }
      }

      if (!stateSnapshotJson) {
        // No state snapshot - use initial deposit as fallback
        if (initialDeposit !== undefined) {
          setBalance(initialDeposit as bigint);
          setIsFromProof(false);
          setProofNumber(null);
        } else {
          setBalance(null);
        }
        return;
      }

      const stateSnapshot: StateSnapshot = JSON.parse(stateSnapshotJson);
      const storageEntries = stateSnapshot.storageEntries || [];

      // Find balance by MPT key
      const myEntry = storageEntries.find(
        (entry) => entry.key.toLowerCase() === mptKey.toLowerCase()
      );

      if (!myEntry) {
        // MPT key not found in snapshot - use initial deposit as fallback
        if (initialDeposit !== undefined) {
          setBalance(initialDeposit as bigint);
          setIsFromProof(false);
          setProofNumber(null);
        } else {
          setBalance(null);
        }
        return;
      }

      // Parse balance value
      const balanceValue = myEntry.value;
      let parsedBalance: bigint;
      if (!balanceValue || balanceValue === "0x" || balanceValue === "") {
        parsedBalance = BigInt(0);
      } else {
        parsedBalance = BigInt(balanceValue);
      }

      setBalance(parsedBalance);
      setIsFromProof(true);
      setProofNumber(latestProof.sequenceNumber || 0);
    } catch (err) {
      console.error("[useChannelUserBalance] Error fetching balance:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch balance");
      
      // Use initial deposit as fallback on error
      if (initialDeposit !== undefined) {
        setBalance(initialDeposit as bigint);
        setIsFromProof(false);
        setProofNumber(null);
      } else {
        setBalance(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [channelId, mptKey, initialDeposit]);

  // Auto-fetch when dependencies change
  useEffect(() => {
    if (channelId && mptKey) {
      fetchBalance();
    }
  }, [channelId, mptKey, fetchBalance]);

  // Format balance
  const balanceFormatted = balance !== null
    ? parseFloat(formatUnits(balance, decimals)).toFixed(2)
    : "0.00";

  return {
    balance,
    balanceFormatted,
    tokenSymbol: tokenAddress ? (getTokenByAddress(tokenAddress)?.symbol ?? "TON") : "TON",
    isFromProof,
    proofNumber,
    isLoading: isLoading || isLoadingDeposit || isLoadingSlotIndex,
    error,
    refetch: fetchBalance,
  };
}
