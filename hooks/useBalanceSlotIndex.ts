/**
 * useBalanceSlotIndex Hook
 *
 * Queries the getBalanceSlotIndex contract function to get the correct
 * slot index for a given target contract (token address).
 *
 * Slot indices:
 * - TON: 0
 * - USDT: 1
 * - USDC: 2
 *
 * Uses useBridgeCoreRead for automatic React Query caching.
 * Same targetContract will return cached result without re-fetching.
 */

import { useBridgeCoreRead } from "@/hooks/contract";

interface UseBalanceSlotIndexParams {
  /** Target contract address (token address) */
  targetContract: string | null | undefined;
}

interface UseBalanceSlotIndexResult {
  /** The balance slot index for the target contract */
  slotIndex: number | undefined;
  /** Whether the query is loading */
  isLoading: boolean;
}

/**
 * Hook to get the balance slot index for a target contract
 *
 * @param params - Parameters containing the target contract address
 * @returns Object with slotIndex and loading state
 *
 * @example
 * ```tsx
 * const { slotIndex, isLoading } = useBalanceSlotIndex({
 *   targetContract: "0x42d3b260c761cD5da022dB56Fe2F89c4A909b04A" // USDT
 * });
 * // slotIndex will be 1 for USDT
 * ```
 */
export function useBalanceSlotIndex({
  targetContract,
}: UseBalanceSlotIndexParams): UseBalanceSlotIndexResult {
  const { data, isLoading } = useBridgeCoreRead({
    functionName: "getBalanceSlotIndex",
    args: targetContract ? [targetContract as `0x${string}`] : undefined,
    query: {
      enabled: !!targetContract,
      // Cache for 5 minutes - slot index doesn't change frequently
      staleTime: 5 * 60 * 1000,
    },
  });

  return {
    slotIndex: data !== undefined ? Number(data) : undefined,
    isLoading,
  };
}
