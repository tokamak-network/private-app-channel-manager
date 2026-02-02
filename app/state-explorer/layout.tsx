/**
 * State Explorer Layout
 *
 * Common layout for all state explorer pages
 * Shows channel header and leader actions
 */

"use client";

import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useChannelFlowStore } from "@/stores/useChannelFlowStore";
import { AppLayout } from "@/components/AppLayout";
import { formatAddress } from "@/lib/utils/format";
import { useInitializeState } from "./_hooks/useInitializeState";
import { InitializeStateConfirmModal } from "./_components/InitializeStateConfirmModal";
import { ParticipantDeposits } from "./_components/ParticipantDeposits";
import { useBridgeCoreRead } from "@/hooks/contract";
import { useWithdrawableAmount } from "@/hooks/useWithdrawableAmount";
import { Copy, Check } from "lucide-react";
import { ChannelStepper } from "./_components/ChannelStepper";
import { SecurityBanner } from "@/components/SecurityBanner";
import { TokenProvider } from "./_context";
import { getTokenByAddress, SUPPORTED_TOKENS } from "@tokamak/config";

// ChannelState enum from contract: 0=None, 1=Initialized, 2=Open, 3=Closing, 4=Closed
type ContractChannelState = 0 | 1 | 2 | 3 | 4;

export default function StateExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { currentChannelId } = useChannelFlowStore();
  const channelId = currentChannelId;

  // Get channel state from contract - refetch every 5 seconds for real-time updates
  const { data: contractChannelStateData, refetch: refetchChannelState } =
    useBridgeCoreRead({
      functionName: "getChannelState",
      args: channelId ? [channelId as `0x${string}`] : undefined,
      query: {
        enabled: !!channelId && isConnected,
        refetchInterval: 5000,
      },
    });

  // Get channel leader
  const { data: channelLeader } = useBridgeCoreRead({
    functionName: "getChannelLeader",
    args: channelId ? [channelId as `0x${string}`] : undefined,
    query: {
      enabled: !!channelId && isConnected,
    },
  });

  // Store contract channel state as number
  const [contractChannelState, setContractChannelState] = useState<ContractChannelState | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasWithdrawableAmount, setHasWithdrawableAmount] = useState(false);
  const [targetContractFromApi, setTargetContractFromApi] = useState<string | null>(null);

  // Get target contract from contract (may be 0x0 after cleanupChannel)
  const { data: targetContractFromContract } = useBridgeCoreRead({
    functionName: "getChannelTargetContract",
    args: channelId ? [channelId as `0x${string}`] : undefined,
    query: {
      enabled: !!channelId && isConnected,
    },
  });

  // Fetch targetContract from API as fallback (stored in DB, persists after cleanupChannel)
  const fetchTargetContractFromApi = useCallback(async () => {
    if (!channelId) return;
    try {
      const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.targetContract) {
          setTargetContractFromApi(data.data.targetContract);
        }
      }
    } catch (error) {
      console.error("[StateExplorerLayout] Failed to fetch channel from API:", error);
    }
  }, [channelId]);

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

  // Get token info from targetContract
  const tokenInfo = useMemo(() => {
    if (!targetContract) return SUPPORTED_TOKENS.TON;
    return getTokenByAddress(targetContract) ?? SUPPORTED_TOKENS.TON;
  }, [targetContract]);

  // Get withdrawable amount for current user using the updated hook
  // (uses getValidatedUserSlotValue + getBalanceSlotIndex internally)
  const { withdrawableAmount, hasWithdrawableAmount: hookHasWithdrawable } = useWithdrawableAmount({
    channelId,
  });

  // Update hasWithdrawableAmount when withdrawableAmount changes
  useEffect(() => {
    if (hookHasWithdrawable !== undefined) {
      setHasWithdrawableAmount(hookHasWithdrawable);
    }
  }, [hookHasWithdrawable]);

  // Update channel state based on contract
  useEffect(() => {
    if (contractChannelStateData !== undefined) {
      const state = Number(contractChannelStateData) as ContractChannelState;
      setContractChannelState(state);
    }
  }, [contractChannelStateData]);

  // Check if current user is leader
  useEffect(() => {
    if (channelLeader && address) {
      setIsLeader(
        String(channelLeader).toLowerCase() === address.toLowerCase()
      );
    } else {
      setIsLeader(false);
    }
  }, [channelLeader, address]);

  // Initialize state hook
  const {
    initializeState,
    isProcessing,
    isGeneratingProof,
    isLoadingChannelData,
    isWriting,
    isWaiting,
    initializeSuccess,
    initializeTxHash,
    proofStatus,
    error: initializeError,
    currentStep: initializeCurrentStep,
    reset: resetInitialize,
  } = useInitializeState({
    channelId: channelId as `0x${string}` | null,
  });

  // Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Redirect to home if no channel selected
  useEffect(() => {
    if (!channelId) {
      router.replace("/");
    }
  }, [channelId, router]);

  // Show loading while redirecting
  if (!channelId) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-gray-500">Redirecting...</p>
        </div>
      </AppLayout>
    );
  }

  const handleOpenInitializeModal = () => {
    if (!channelId) return;
    setShowConfirmModal(true);
  };

  const handleInitializeState = async () => {
    if (!channelId) return;
    await initializeState();
  };

  const handleCloseModal = async () => {
    setShowConfirmModal(false);
    // Refetch channel state to check if it's now active
    // The page will automatically show transaction component when state changes
    await refetchChannelState();
  };

  const handleCopyChannelId = async () => {
    if (!channelId) return;

    try {
      await navigator.clipboard.writeText(channelId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy channel ID:", err);
    }
  };

  return (
    <AppLayout>
      <TokenProvider targetContract={targetContract} isLoading={!targetContract}>
      <div className="space-y-6">
        {/* Header - Channel ID */}
        <div className="flex items-center gap-8">
          <h1
            className="font-mono font-medium text-[#111111]"
            style={{ fontSize: 40, lineHeight: "1.3em" }}
          >
            Channel {formatAddress(channelId)}
          </h1>
          <button
            onClick={handleCopyChannelId}
            className="hover:opacity-70 transition-opacity"
            title={copied ? "Copied!" : "Copy channel ID"}
          >
            {copied ? (
              <Check className="text-[#3EB100]" style={{ width: 40, height: 40 }} />
            ) : (
              <Copy className="text-[#666666]" style={{ width: 40, height: 40 }} />
            )}
          </button>
        </div>

        {/* Security Banner */}
        <SecurityBanner />

        {/* Channel Progress Stepper */}
        <ChannelStepper
          currentState={contractChannelState}
          channelId={channelId}
          userAddress={address}
          hasWithdrawableAmount={hasWithdrawableAmount}
        />

        {/* Leader Actions */}
        {isLeader && contractChannelState !== null && (
          <div className="flex flex-col gap-4" style={{ width: 544 }}>
            {/* state === 1 (Initialized): Show Initialize State button during deposit phase */}
            {contractChannelState === 1 && (
              <>
                <button
                  type="button"
                  onClick={handleOpenInitializeModal}
                  disabled={isLoadingChannelData}
                  data-testid="initialize-state-button"
                  className="flex items-center justify-center font-mono font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    height: 40,
                    padding: "16px 24px",
                    borderRadius: 4,
                    border: "1px solid #111111",
                    backgroundColor: "#0FBCBC",
                    color: "#FFFFFF",
                    fontSize: 18,
                    cursor: isLoadingChannelData ? "not-allowed" : "pointer",
                  }}
                  title={isLoadingChannelData ? "Loading channel data..." : "Initialize channel state"}
                >
                  {isLoadingChannelData ? "Loading..." : "Initialize State"}
                </button>

                {/* Participant Deposits - Collapsible, collapsed by default */}
                <ParticipantDeposits
                  channelId={channelId}
                  tokenSymbol={tokenInfo.symbol}
                  tokenDecimals={tokenInfo.decimals}
                  collapsible={true}
                  defaultExpanded={false}
                  showLeaderCheck={false}
                />
              </>
            )}
            {/* state === 3 (Closing): Close Channel button is shown in state3/page.tsx */}
            {/* state === 4 (Closed): No buttons during withdraw phase */}
          </div>
        )}

        {/* Page Content */}
        <div>{children}</div>
      </div>

      {/* Initialize State Confirm Modal */}
      {showConfirmModal && channelId && (
        <InitializeStateConfirmModal
          channelId={channelId}
          onInitialize={handleInitializeState}
          isProcessing={isProcessing}
          isLoadingChannelData={isLoadingChannelData}
          txHash={initializeTxHash ?? null}
          currentStep={initializeCurrentStep}
          onClose={handleCloseModal}
        />
      )}
      </TokenProvider>
    </AppLayout>
  );
}
