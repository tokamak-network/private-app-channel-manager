/**
 * Transaction Confirm Modal
 *
 * Modal for confirming and completing channel creation transaction
 * States: confirm -> processing -> completed
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, CheckCircle2, Copy, Circle, AlertTriangle } from "lucide-react";
import { useChannelFlowStore } from "@/stores/useChannelFlowStore";
import { Button } from "@/components/ui";
import type { CreateChannelStep } from "../_hooks/useCreateChannel";

interface TransactionConfirmModalProps {
  channelId: string;
  participantCount: number;
  onCreateChannel: () => Promise<void>;
  isCreating: boolean;
  isConfirming: boolean;
  txHash: string | null;
  onClose: () => void;
  currentStep?: CreateChannelStep;
  error?: string | null;
}

type ModalState = "confirm" | "processing" | "completed";

// Step definitions for progress display
const TRANSACTION_STEPS = [
  { key: "signing", label: "Signing Transaction" },
  { key: "confirming", label: "Confirming Transaction" },
] as const;

export function TransactionConfirmModal({
  channelId,
  participantCount,
  onCreateChannel,
  isCreating,
  isConfirming,
  txHash,
  onClose,
  currentStep = "idle",
  error,
}: TransactionConfirmModalProps) {
  const router = useRouter();
  const [modalState, setModalState] = useState<ModalState>("confirm");
  const [copiedChannelId, setCopiedChannelId] = useState(false);
  const [copiedTxHash, setCopiedTxHash] = useState(false);

  // Get current step index for progress display
  const getCurrentStepIndex = () => {
    return TRANSACTION_STEPS.findIndex((s) => s.key === currentStep);
  };

  useEffect(() => {
    if (currentStep === "completed") {
      setModalState("completed");
    } else if (currentStep === "signing" || currentStep === "confirming" || isCreating || isConfirming) {
      setModalState("processing");
    } else if (currentStep === "error") {
      setModalState("confirm");
    }
  }, [isCreating, isConfirming, currentStep]);

  const handleConfirm = async () => {
    setModalState("processing");
    try {
      await onCreateChannel();
    } catch (err) {
      // If user rejected or error occurred, go back to confirm state
      setModalState("confirm");
    }
  };

  const handleJoinChannel = () => {
    const { setCurrentChannelId } = useChannelFlowStore.getState();
    setCurrentChannelId(channelId);
    onClose();
    router.push("/join-channel");
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
                Confirm Transaction
              </h3>
              <p className="text-[#666666]" style={{ fontSize: 14 }}>
                Please confirm the channel creation details below
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-[#FEF2F2] border border-[#FECACA] rounded">
                <AlertTriangle className="w-5 h-5 text-[#DC2626] flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#DC2626]">Transaction Failed</p>
                  <p className="text-xs text-[#991B1B] mt-1 break-all">{error}</p>
                </div>
              </div>
            )}

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
              <div className="flex justify-between">
                <span className="text-[#666666]" style={{ fontSize: 14 }}>
                  Participants
                </span>
                <span className="text-[#111111] font-medium" style={{ fontSize: 14 }}>
                  {participantCount}
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              size="full"
              onClick={handleConfirm}
            >
              {error ? "Retry" : "Confirm"}
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
                Creating Channel
              </h3>
              <p className="text-[#666666]" style={{ fontSize: 14 }}>
                Please sign the transaction in your wallet
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
              <div className="flex justify-between">
                <span className="text-[#666666]" style={{ fontSize: 14 }}>
                  Participants
                </span>
                <span className="text-[#111111] font-medium" style={{ fontSize: 14 }}>
                  {participantCount}
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
                Channel Created
              </h3>
              <p className="text-[#666666]" style={{ fontSize: 14 }}>
                Your channel has been successfully created.
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
              variant="purple"
              size="full"
              onClick={handleJoinChannel}
            >
              Join Channel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
