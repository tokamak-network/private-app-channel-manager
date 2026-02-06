/**
 * Close Channel Confirm Modal
 *
 * Modal for confirming and closing channel with step-by-step progress
 * Steps: 1. Preparing Data -> 2. Generating Proof -> 3. Signing -> 4. Confirming
 */

"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui";

export type CloseChannelModalStep =
  | "idle"
  | "preparing"
  | "generating_proof"
  | "signing"
  | "confirming"
  | "completed"
  | "error";

// Step definitions for progress display
const CLOSE_CHANNEL_STEPS = [
  { key: "preparing", label: "Preparing Data" },
  { key: "generating_proof", label: "Generating ZK Proof" },
  { key: "signing", label: "Signing Transaction" },
  { key: "confirming", label: "Confirming Transaction" },
] as const;

interface CloseChannelConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  channelId: string;
  participantsCount: number;
  currentStep?: CloseChannelModalStep;
  onStepChange?: (step: CloseChannelModalStep) => void;
}

type ModalState = "confirm" | "processing" | "completed" | "error";

export function CloseChannelConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  channelId,
  participantsCount,
  currentStep: externalStep,
  onStepChange,
}: CloseChannelConfirmModalProps) {
  const [modalState, setModalState] = useState<ModalState>("confirm");
  const [internalStep, setInternalStep] = useState<CloseChannelModalStep>("idle");
  const [error, setError] = useState<string | null>(null);

  // Use external step if provided, otherwise use internal
  const currentStep = externalStep ?? internalStep;

  // Update step - either via callback or internal state
  const updateStep = (step: CloseChannelModalStep) => {
    if (onStepChange) {
      onStepChange(step);
    } else {
      setInternalStep(step);
    }
  };

  // Update modal state based on external step changes
  useEffect(() => {
    if (externalStep === "completed" && modalState === "processing") {
      setModalState("completed");
    } else if (externalStep === "error" && modalState === "processing") {
      setModalState("error");
    }
  }, [externalStep, modalState]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setModalState("processing");
    updateStep("preparing");
    setError(null);

    try {
      await onConfirm();

      // If using internal state (no external step management), mark as completed
      if (!onStepChange) {
        updateStep("completed");
        setModalState("completed");
      }
    } catch (err) {
      console.error("Close channel error:", err);
      updateStep("error");
      setModalState("error");
      setError(err instanceof Error ? err.message : "Failed to close channel");
    }
  };

  const handleClose = () => {
    if (modalState !== "processing") {
      // Call onClose first, then reset internal state
      // This ensures parent can check the current step before it's reset
      onClose();
      setModalState("confirm");
      updateStep("idle");
      setError(null);
    }
  };

  // Get current step index for progress display
  const getCurrentStepIndex = () => {
    return CLOSE_CHANNEL_STEPS.findIndex((s) => s.key === currentStep);
  };

  // Truncate channel ID for display
  const truncatedChannelId = channelId
    ? `${channelId.slice(0, 10)}...${channelId.slice(-8)}`
    : "";

  // Get description based on current step
  const getStepDescription = (): React.ReactNode => {
    switch (currentStep) {
      case "preparing":
        return "Preparing final state data and permutation...";
      case "generating_proof":
        return "Generating ZK proof...";
      case "signing":
        return "Please sign the transaction in your wallet";
      case "confirming":
        return "Confirming transaction on blockchain...";
      default:
        return "Processing...";
    }
  };

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
                Confirm Close Channel
              </h3>
              <p className="text-[#666666]" style={{ fontSize: 14 }}>
                This will permanently close the channel and distribute final balances
              </p>
            </div>

            {/* Channel Details */}
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
                  {participantsCount}
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              size="full"
              onClick={handleConfirm}
            >
              Confirm & Close Channel
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
                Closing Channel
              </h3>
              <p className="text-[#666666]" style={{ fontSize: 14 }}>
                {getStepDescription()}
              </p>
            </div>

            {/* Step Progress */}
            <div className="w-full space-y-3 pt-4 border-t border-[#EEEEEE]">
              {CLOSE_CHANNEL_STEPS.map((step, index) => {
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

            {/* Channel Details */}
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
                Channel Closed
              </h3>
              <p className="text-[#666666]" style={{ fontSize: 14 }}>
                The channel has been successfully closed. Participants can now withdraw their funds.
              </p>
            </div>

            {/* Channel Details */}
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

            <Button
              variant="primary"
              size="full"
              onClick={handleClose}
            >
              Close
            </Button>
          </div>
        )}

        {/* Error State */}
        {modalState === "error" && (
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-[#CD0003]/10 flex items-center justify-center">
              <X className="w-8 h-8 text-[#CD0003]" />
            </div>
            <div className="text-center">
              <h3
                className="font-medium text-[#111111] mb-2"
                style={{ fontSize: 24 }}
              >
                Failed to Close Channel
              </h3>
              <p className="text-[#CD0003]" style={{ fontSize: 14 }}>
                {error || "An error occurred while closing the channel."}
              </p>
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
