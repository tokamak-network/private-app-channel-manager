/**
 * State Explorer Root Page
 *
 * Shows appropriate component based on channel state
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useChannelFlowStore } from "@/stores/useChannelFlowStore";
import { useBridgeCoreRead } from "@/hooks/contract";
import { useWithdrawableAmount } from "@/hooks/useWithdrawableAmount";
import DepositPage from "./deposit/page";
import TransactionPage from "./transaction/page";
import WithdrawPage from "./withdraw/page";
import State3Page from "./state3/page";
import State0Page from "./state0/page";

// ChannelState enum from contract: 0=None, 1=Initialized, 2=Open, 3=Closing, 4=Closed
type ContractChannelState = 0 | 1 | 2 | 3 | 4;

export default function StateExplorerPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { currentChannelId } = useChannelFlowStore();
  const [contractChannelState, setContractChannelState] =
    useState<ContractChannelState | null>(null);
  const [hasWithdrawableAmount, setHasWithdrawableAmount] = useState(false);

  // Store targetContract from API (persists even after cleanupChannel)
  const [targetContractFromApi, setTargetContractFromApi] = useState<
    string | null
  >(null);

  // Get channel state from contract
  const {
    data: channelStateData,
    isLoading: isLoadingState,
    refetch: refetchChannelState,
  } = useBridgeCoreRead({
    functionName: "getChannelState",
    args: currentChannelId ? [currentChannelId as `0x${string}`] : undefined,
    query: {
      enabled: !!currentChannelId && isConnected,
    },
  });

  // Get target contract from contract (may be 0x0 after cleanupChannel)
  const { data: targetContractFromContract } = useBridgeCoreRead({
    functionName: "getChannelTargetContract",
    args: currentChannelId ? [currentChannelId as `0x${string}`] : undefined,
    query: {
      enabled: !!currentChannelId && isConnected,
    },
  });

  // Fetch targetContract from API as fallback (stored in DB, persists after cleanupChannel)
  const fetchTargetContractFromApi = useCallback(async () => {
    if (!currentChannelId) return;

    try {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(currentChannelId)}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.targetContract) {
          setTargetContractFromApi(data.data.targetContract);
        }
      }
    } catch (error) {
      console.error(
        "[StateExplorerPage] Failed to fetch channel from API:",
        error
      );
    }
  }, [currentChannelId]);

  // Fetch targetContract from API on mount or when channelId changes
  useEffect(() => {
    fetchTargetContractFromApi();
  }, [fetchTargetContractFromApi]);

  // Use contract targetContract if valid, otherwise use API fallback
  const targetContract =
    targetContractFromContract &&
    targetContractFromContract !== "0x0000000000000000000000000000000000000000"
      ? (targetContractFromContract as string)
      : targetContractFromApi;

  // Get withdrawable amount for current user using the updated hook
  // After cleanupChannel, channel state becomes 0 but withdrawable amounts remain
  // Uses getValidatedUserSlotValue + getBalanceSlotIndex internally
  const { withdrawableAmount, hasWithdrawableAmount: hookHasWithdrawable, isLoading: isLoadingWithdrawable } = useWithdrawableAmount({
    channelId: currentChannelId,
  });

  // Update hasWithdrawableAmount when withdrawableAmount changes
  useEffect(() => {
    if (hookHasWithdrawable !== undefined) {
      setHasWithdrawableAmount(hookHasWithdrawable);
    }
  }, [hookHasWithdrawable]);

  // Update channel state based on contract
  useEffect(() => {
    if (channelStateData !== undefined) {
      // ChannelState enum: 0=None, 1=Initialized, 2=Open, 3=Closing, 4=Closed
      const state = Number(channelStateData) as ContractChannelState;
      console.log("[StateExplorerPage] Channel state updated:", {
        channelId: currentChannelId,
        rawData: channelStateData,
        parsedState: state,
        isLoadingState,
        isLoadingWithdrawable,
        hasWithdrawableAmount,
      });
      setContractChannelState(state);
    }
  }, [channelStateData, currentChannelId, isLoadingState, isLoadingWithdrawable, hasWithdrawableAmount]);

  // Listen for submit proof success events to refetch channel state
  useEffect(() => {
    const handleProofSubmitSuccess = () => {
      refetchWithRetry(3); // Expect state 3 (Closing)
    };

    const handleChannelCloseSuccess = () => {
      // After updateValidatedUserStorage, cleanupChannel is called which sets state to 0
      // but withdrawable amounts are preserved. The useWithdrawableAmount hook will
      // automatically recheck when dependencies change.
      refetchWithRetry(0); // After cleanupChannel, state becomes 0
    };

    // Refetch channel state with retry logic
    const refetchWithRetry = (expectedState: ContractChannelState) => {
      let retryCount = 0;
      const maxRetries = 3;

      const attemptRefetch = () => {
        setTimeout(
          async () => {
            try {
              const result = await refetchChannelState();

              if (result.data !== undefined) {
                const newState = Number(result.data) as ContractChannelState;
                if (newState === expectedState) {
                  return; // Success, stop retrying
                }
              }

              // If state hasn't changed yet and we haven't exceeded max retries, try again
              if (retryCount < maxRetries) {
                retryCount++;
                attemptRefetch();
              }
            } catch {
              if (retryCount < maxRetries) {
                retryCount++;
                attemptRefetch();
              }
            }
          },
          retryCount === 0 ? 1000 : 2000
        ); // First attempt after 1s, then every 2s
      };

      attemptRefetch();
    };

    // Listen for custom events
    window.addEventListener("proof-submit-success", handleProofSubmitSuccess);
    window.addEventListener("channel-close-success", handleChannelCloseSuccess);

    return () => {
      window.removeEventListener(
        "proof-submit-success",
        handleProofSubmitSuccess
      );
      window.removeEventListener(
        "channel-close-success",
        handleChannelCloseSuccess
      );
    };
  }, [refetchChannelState]);

  // Redirect to home if no channel selected
  useEffect(() => {
    if (!currentChannelId) {
      router.replace("/");
    }
  }, [currentChannelId, router]);

  if (!currentChannelId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-gray-300 border-t-purple-600 rounded-full animate-spin" />
          <p className="text-gray-500 font-mono">Loading...</p>
        </div>
      </div>
    );
  }

  // Show loading state while fetching channel state or withdrawable amount
  // For state 0, we need to wait for withdrawable amount check to complete
  const isLoading = isLoadingState || contractChannelState === null || 
    (contractChannelState === 0 && isLoadingWithdrawable);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-gray-300 border-t-purple-600 rounded-full animate-spin" />
          <p className="text-gray-500 font-mono">Loading channel state...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Content - Show appropriate component based on channel state */}
      {/* state === 0 (None) without withdrawable: Channel doesn't exist or deleted */}
      {/* state === 0 (None) with withdrawable: Show withdraw page (after cleanupChannel) */}
      {/* state === 1 (Initialized): Show deposit page */}
      {/* state === 2 (Open): Show transaction page */}
      {/* state === 3 (Closing): Show state3 page with close channel button */}
      {/* state === 4 (Closed): Show withdraw page */}

      {/* State0 page: state 0 without withdrawable (channel doesn't exist or deleted) */}
      {contractChannelState === 0 && !hasWithdrawableAmount && <State0Page />}

      {/* Withdraw page: state 4 OR state 0 with withdrawable amount (after cleanupChannel) */}
      {(contractChannelState === 4 ||
        (contractChannelState === 0 && hasWithdrawableAmount)) && (
        <WithdrawPage />
      )}

      {/* Deposit page: state 1 (Initialized - waiting for deposits) */}
      {contractChannelState === 1 && <DepositPage />}

      {/* Transaction page: state 2 */}
      {contractChannelState === 2 && <TransactionPage />}

      {/* State3 page: state 3 */}
      {contractChannelState === 3 && <State3Page />}

      {/* Fallback */}
      {contractChannelState !== 0 &&
        contractChannelState !== 1 &&
        contractChannelState !== 2 &&
        contractChannelState !== 3 &&
        contractChannelState !== 4 && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              Unknown channel state: {contractChannelState}
            </p>
          </div>
        )}
    </div>
  );
}
