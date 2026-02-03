/**
 * useTransactionHistory Hook
 *
 * Fetches transaction history (balance changes) for a user in a channel.
 * Compares balance changes across verified proofs to determine
 * received/sent tokens.
 *
 * Used by AccountPanel to display transaction history.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useBridgeCoreRead } from "@/hooks/contract";
import { useBalanceSlotIndex } from "@/hooks/useBalanceSlotIndex";
import { formatUnits } from "viem";
import JSZip from "jszip";

export interface TransactionHistoryItem {
  /** Type of transaction: received (+) or sent (-) */
  type: "received" | "sent";
  /** Amount in wei (bigint) */
  amountWei: bigint;
  /** Formatted amount (e.g., "3,200.00") */
  amountFormatted: string;
  /** Token symbol */
  token: string;
  /** Date string */
  date: string;
  /** Timestamp (Unix milliseconds) */
  timestamp: number;
  /** Sequence number of the proof */
  sequenceNumber: number;
}

export interface TransactionHistoryResult {
  /** List of transactions (most recent first) */
  transactions: TransactionHistoryItem[];
  /** Whether the data is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Refetch the history */
  refetch: () => Promise<void>;
}

interface UseTransactionHistoryParams {
  channelId: string | null;
  /** Token decimals (default: 18) */
  decimals?: number;
  /** Token symbol (default: "TON") */
  tokenSymbol?: string;
  /** Token address for slotIndex lookup */
  tokenAddress?: string | null;
}

export function useTransactionHistory({
  channelId,
  decimals = 18,
  tokenSymbol = "TON",
  tokenAddress,
}: UseTransactionHistoryParams): TransactionHistoryResult {
  const { address, isConnected } = useAccount();

  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { slotIndex, isLoading: isLoadingSlotIndex } = useBalanceSlotIndex({
    targetContract: tokenAddress,
  });

  const { data: mptKeyData, isLoading: isLoadingMptKey } = useBridgeCoreRead({
    functionName: "getL2MptKey",
    args:
      channelId && address && slotIndex !== undefined
        ? [channelId as `0x${string}`, address as `0x${string}`, slotIndex]
        : undefined,
    query: {
      enabled: !!channelId && !!address && isConnected && slotIndex !== undefined,
    },
  });

  const { data: initialDepositData, isLoading: isLoadingDeposit } =
    useBridgeCoreRead({
      functionName: "getValidatedUserSlotValue",
      args:
        channelId && address && slotIndex !== undefined
          ? [channelId as `0x${string}`, address as `0x${string}`, slotIndex]
          : undefined,
      query: {
        enabled: !!channelId && !!address && isConnected && slotIndex !== undefined,
      },
    });

  const mptKey = mptKeyData
    ? `0x${(mptKeyData as bigint).toString(16).padStart(64, "0")}`
    : null;
  const initialDeposit =
    initialDepositData !== undefined ? (initialDepositData as bigint) : null;

  /**
   * Format amount with thousand separators
   */
  const formatAmount = useCallback(
    (amountWei: bigint): string => {
      const formatted = formatUnits(amountWei < BigInt(0) ? -amountWei : amountWei, decimals);
      const num = parseFloat(formatted);
      return num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
    [decimals]
  );

  /**
   * Format timestamp to date string
   */
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) + " " + date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /**
   * Fetch all verified proofs and compute transaction history
   */
  const fetchTransactionHistory = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (!channelId || !mptKey || initialDeposit === null) {
      setTransactions([]);
      return;
    }

    if (!silent) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const normalizedChannelId = channelId.toLowerCase();
      const encodedChannelId = encodeURIComponent(normalizedChannelId);

      // Fetch verified proofs from DB (add silent param to suppress API logs during polling)
      const silentParam = silent ? "&silent=true" : "";
      const proofsResponse = await fetch(
        `/api/channels/${encodedChannelId}/proofs?type=verified${silentParam}`
      );

      if (!proofsResponse.ok) {
        setTransactions([]);
        return;
      }

      const proofsData = await proofsResponse.json();
      if (!proofsData.success || !proofsData.data) {
        setTransactions([]);
        return;
      }

      // Get proofs array
      let proofsArray: Array<{
        key: string;
        sequenceNumber: number;
        verifiedAt?: number | string;
        timestamp?: number;
      }> = [];

      if (Array.isArray(proofsData.data)) {
        proofsArray = proofsData.data;
      } else if (proofsData.data && typeof proofsData.data === "object") {
        proofsArray = Object.entries(proofsData.data).map(
          ([key, value]: [string, any]) => ({
            key,
            ...value,
          })
        );
      }

      // Sort by sequence number (ascending for calculation)
      proofsArray.sort(
        (a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0)
      );

      if (proofsArray.length === 0) {
        setTransactions([]);
        return;
      }

      // Process each proof and compute balance changes
      const txHistory: TransactionHistoryItem[] = [];
      let previousBalance = initialDeposit;

      for (const proof of proofsArray) {
        try {
          // Load the proof ZIP file (add silent param to suppress API logs during polling)
          const zipApiUrl = `/api/get-proof-zip?channelId=${encodeURIComponent(
            normalizedChannelId
          )}&proofId=${encodeURIComponent(proof.key)}&status=verifiedProofs&format=binary${silentParam}`;

          const zipResponse = await fetch(zipApiUrl);

          if (!zipResponse.ok) {
            console.warn(
              `[useTransactionHistory] Failed to load proof ZIP for ${proof.key}`
            );
            continue;
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
            console.warn(
              `[useTransactionHistory] state_snapshot.json not found for ${proof.key}`
            );
            continue;
          }

          const stateSnapshot = JSON.parse(stateSnapshotJson);
          const storageEntries = stateSnapshot.storageEntries || [];

          // Helper to safely convert hex to BigInt (handles empty "0x" values)
          const safeBigInt = (value: string): bigint => {
            if (!value || value === "0x" || value === "") return BigInt(0);
            return BigInt(value);
          };

          // Find my balance by MPT key
          const myEntry = storageEntries.find(
            (entry: { key: string; value: string }) =>
              entry.key.toLowerCase() === mptKey.toLowerCase()
          );

          if (!myEntry) {
            // MPT key not found - might be removed or error
            continue;
          }

          const currentBalance = safeBigInt(myEntry.value);
          const diff = currentBalance - previousBalance;

          // Only add if there's a change
          if (diff !== BigInt(0)) {
            // Determine timestamp
            let timestamp: number;
            if (typeof proof.verifiedAt === "number") {
              timestamp = proof.verifiedAt;
            } else if (typeof proof.verifiedAt === "string") {
              timestamp = new Date(proof.verifiedAt).getTime();
            } else if (proof.timestamp) {
              timestamp = proof.timestamp;
            } else {
              timestamp = Date.now();
            }

            txHistory.push({
              type: diff > BigInt(0) ? "received" : "sent",
              amountWei: diff > BigInt(0) ? diff : -diff,
              amountFormatted: formatAmount(diff),
              token: tokenSymbol,
              date: formatDate(timestamp),
              timestamp,
              sequenceNumber: proof.sequenceNumber || 0,
            });
          }

          // Update previous balance for next iteration
          previousBalance = currentBalance;
        } catch (err) {
          console.error(
            `[useTransactionHistory] Error processing proof ${proof.key}:`,
            err
          );
        }
      }

      // Sort by timestamp (most recent first)
      txHistory.sort((a, b) => b.timestamp - a.timestamp);

      setTransactions(txHistory);
    } catch (err) {
      console.error("[useTransactionHistory] Error:", err);
      if (!silent) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch transaction history"
        );
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [channelId, mptKey, initialDeposit, formatAmount, tokenSymbol]);

  /**
   * Refetch function
   */
  const refetch = useCallback(async () => {
    if (isLoadingMptKey || isLoadingDeposit) {
      return;
    }
    await fetchTransactionHistory();
  }, [isLoadingMptKey, isLoadingDeposit, fetchTransactionHistory]);

  // Auto-fetch when dependencies change
  useEffect(() => {
    if (!isLoadingMptKey && !isLoadingDeposit && mptKey && initialDeposit !== null) {
      fetchTransactionHistory();
    }
  }, [mptKey, initialDeposit, isLoadingMptKey, isLoadingDeposit, fetchTransactionHistory]);

  // Poll every 5 seconds for updates (silent mode to avoid flickering)
  useEffect(() => {
    if (!channelId || !mptKey || initialDeposit === null) return;
    if (isLoadingMptKey || isLoadingDeposit) return;

    const intervalId = setInterval(() => {
      fetchTransactionHistory({ silent: true });
    }, 5000);

    return () => clearInterval(intervalId);
  }, [channelId, mptKey, initialDeposit, isLoadingMptKey, isLoadingDeposit, fetchTransactionHistory]);

  return {
    transactions,
    isLoading: isLoading || isLoadingMptKey || isLoadingDeposit,
    error,
    refetch,
  };
}
