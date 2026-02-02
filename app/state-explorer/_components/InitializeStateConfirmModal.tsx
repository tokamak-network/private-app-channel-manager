/**
 * Initialize State Confirm Modal
 *
 * Modal for confirming and completing state initialization
 * States: confirm -> processing -> completed
 */

"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle2, Copy, Circle } from "lucide-react";
import { Button } from "@/components/ui";
import { ParticipantDeposits } from "./ParticipantDeposits";
import type { InitializeStateStep } from "../_hooks/useInitializeState";
import { useToken } from "../_context";

// Step definitions for progress display
const TRANSACTION_STEPS = [
  { key: "generating_proof", label: "Generating Proof" },
  { key: "signing", label: "Signing Transaction" },
  { key: "confirming", label: "Confirming Transaction" },
] as const;

interface InitializeStateConfirmModalProps {
  channelId: string;
  onInitialize: () => Promise<void>;
  isProcessing: boolean;
  isLoadingChannelData: boolean;
  txHash: string | null;
  onClose: () => void;
  currentStep?: InitializeStateStep;
}

type ModalState = "confirm" | "processing" | "completed";

export function InitializeStateConfirmModal({
  channelId,
  onInitialize,
  isProcessing,
  isLoadingChannelData,
  txHash,
  onClose,
  currentStep = "idle",
}: InitializeStateConfirmModalProps) {
  const { tokenSymbol, tokenDecimals } = useToken();
  const [modalState, setModalState] = useState<ModalState>("confirm");
  const [copiedChannelId, setCopiedChannelId] = useState(false);
  const [copiedTxHash, setCopiedTxHash] = useState(false);

  // Get current step index for progress display
  const getCurrentStepIndex = () => {
    return TRANSACTION_STEPS.findIndex((s) => s.key === currentStep);
  };

  // Update modal state based on props
  useEffect(() => {
    if (isProcessing) {
      setModalState("processing");
    } else if (txHash) {
      setModalState("completed");
    } else if (modalState === "processing") {
      // If not processing anymore and no txHash, go back to confirm
      setModalState("confirm");
    }
  }, [isProcessing, txHash, modalState]);

  const handleConfirm = async () => {
    setModalState("processing");
    try {
      await onInitialize();
    } catch (err) {
      // If user rejected or error occurred, go back to confirm state
      setModalState("confirm");
    }
  };

  const handleClose = () => {
    if (modalState !== "processing") {
      onClose();
    }
  };

  const handleCopyChannelId = async () => {
    try {
      await navigator.clipboard.writeText(channelId);
      setCopiedChannelId(true);
      setTimeout(() => setCopiedChannelId(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleCopyTxHash = async () => {
    if (!txHash) return;
    try {
      await navigator.clipboard.writeText(txHash);
      setCopiedTxHash(true);
      setTimeout(() => setCopiedTxHash(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Truncate for display
  const truncatedChannelId = channelId
    ? `${channelId.slice(0, 10)}...${channelId.slice(-8)}`
    : "";
  const truncatedTxHash = txHash
    ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-lg shadow-xl font-mono"
        style={{ width: 480, padding: 32 }}
      >
        {/* Close button - only show when not processing */}
        {modalState !== "processing" && (
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5 text-[#666666]" />
          </button>
        )}

        {/* Confirm State */}
        {modalState === "confirm" && (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <h3
                className="font-medium text-[#111111] mb-2"
                style={{ fontSize: 24 }}
              >
                Confirm Initialize
              </h3>
              <p className="text-[#666666]" style={{ fontSize: 14 }}>
                Please confirm to initialize the channel state
              </p>
            </div>

            {/* Transaction Details */}
            <div className="w-full space-y-3 pt-4 border-t border-[#EEEEEE]">
              <div className="flex justify-between items-center">
                <span className="text-[#666666]" style={{ fontSize: 14 }}>
                  Channel ID
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[#111111] font-medium" style={{ fontSize: 14 }}>
                    {truncatedChannelId}
                  </span>
                  <button
                    onClick={handleCopyChannelId}
                    className="p-1 hover:bg-[#F2F2F2] rounded"
                    title={copiedChannelId ? "Copied!" : "Copy"}
                  >
                    <Copy className={`w-4 h-4 ${copiedChannelId ? "text-[#3EB100]" : "text-[#666666]"}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Participant Deposits Summary - Leader only */}
            <div className="w-full pt-2 border-t border-[#EEEEEE]">
              <ParticipantDeposits
                channelId={channelId}
                tokenSymbol={tokenSymbol}
                tokenDecimals={tokenDecimals}
                collapsible={false}
                showLeaderCheck={true}
                compact={true}
              />
            </div>

            {isLoadingChannelData && (
              <div className="text-center py-2">
                <p className="text-[#666666]" style={{ fontSize: 12 }}>
                  Loading channel data...
                </p>
              </div>
            )}

            <Button
              variant="primary"
              size="full"
              onClick={handleConfirm}
              disabled={isLoadingChannelData}
            >
              {isLoadingChannelData ? "Loading..." : "Confirm"}
            </Button>
          </div>
        )}

        {/* Processing State */}
        {modalState === "processing" && (
          <div className="flex flex-col items-center gap-6">
            <Loader2 className="w-16 h-16 text-[#2A72E5] animate-spin" />
            <div className="text-center">
              <h3
                className="font-medium text-[#111111] mb-2"
                style={{ fontSize: 24 }}
              >
                Initializing State
              </h3>
              <p className="text-[#666666]" style={{ fontSize: 14 }}>
                {currentStep === "generating_proof"
                  ? "Generating zero-knowledge proof..."
                  : currentStep === "signing"
                    ? "Please sign the transaction in your wallet"
                    : "Confirming transaction on blockchain..."}
              </p>
            </div>

            {/* Step Progress */}
            <div className="w-full space-y-3 pt-4 border-t border-[#EEEEEE]">
              {TRANSACTION_STEPS.map((step, index) => {
                const currentIndex = getCurrentStepIndex();
                const isActive = step.key === currentStep;
                const isCompleted = currentIndex > index;

                return (
                  <div key={step.key} className="flex items-center gap-3">
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-[#3EB100] flex-shrink-0" />
                    ) : isActive ? (
                      <Loader2 className="w-5 h-5 text-[#2A72E5] animate-spin flex-shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-[#CCCCCC] flex-shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        isActive
                          ? "text-[#2A72E5] font-medium"
                          : isCompleted
                            ? "text-[#3EB100]"
                            : "text-[#999999]"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Transaction Details */}
            <div className="w-full space-y-3 pt-4 border-t border-[#EEEEEE]">
              <div className="flex justify-between">
                <span className="text-[#666666]" style={{ fontSize: 14 }}>
                  Channel ID
                </span>
                <span className="text-[#111111] font-medium" style={{ fontSize: 14 }}>
                  {truncatedChannelId}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Completed State */}
        {modalState === "completed" && (
          <div className="flex flex-col items-center gap-6">
            <CheckCircle2 className="w-16 h-16 text-[#3EB100]" />
            <div className="text-center">
              <h3
                className="font-medium text-[#111111] mb-2"
                style={{ fontSize: 24 }}
              >
                State Initialized
              </h3>
              <p className="text-[#666666]" style={{ fontSize: 14 }}>
                The channel state has been successfully initialized.
              </p>
            </div>

            {/* Transaction Details */}
            <div className="w-full space-y-3 pt-4 border-t border-[#EEEEEE]">
              <div className="flex justify-between items-center">
                <span className="text-[#666666]" style={{ fontSize: 14 }}>
                  Channel ID
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[#111111] font-medium" style={{ fontSize: 14 }}>
                    {truncatedChannelId}
                  </span>
                  <button
                    onClick={handleCopyChannelId}
                    className="p-1 hover:bg-[#F2F2F2] rounded"
                    title={copiedChannelId ? "Copied!" : "Copy"}
                  >
                    <Copy className={`w-4 h-4 ${copiedChannelId ? "text-[#3EB100]" : "text-[#666666]"}`} />
                  </button>
                </div>
              </div>
              {txHash && (
                <div className="flex justify-between items-center">
                  <span className="text-[#666666]" style={{ fontSize: 14 }}>
                    Tx Hash
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[#111111] font-medium" style={{ fontSize: 14 }}>
                      {truncatedTxHash}
                    </span>
                    <button
                      onClick={handleCopyTxHash}
                      className="p-1 hover:bg-[#F2F2F2] rounded"
                      title={copiedTxHash ? "Copied!" : "Copy"}
                    >
                      <Copy className={`w-4 h-4 ${copiedTxHash ? "text-[#3EB100]" : "text-[#666666]"}`} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <Button
              variant="primary"
              size="full"
              onClick={handleClose}
            >
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
