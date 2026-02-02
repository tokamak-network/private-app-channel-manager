/**
 * Channel Stepper Component
 *
 * Displays channel progress through 4 phases:
 * 1. Deposit (state 1)
 * 2. Transaction (state 2)
 * 3. Close (state 3)
 * 4. Withdraw (state 4)
 */

"use client";

import { Check } from "lucide-react";
import { useBridgeCoreRead } from "@/hooks/contract";
import { formatUnits } from "viem";
import { useToken } from "../_context";

// Contract channel states: 0=None, 1=Initialized, 2=Open, 3=Closing, 4=Closed
type ContractChannelState = 0 | 1 | 2 | 3 | 4;

interface Step {
  id: number;
  label: string;
  description: string;
  contractState: ContractChannelState;
}

const STEPS: Step[] = [
  {
    id: 1,
    label: "Deposit",
    description:
      "Deposit your funds to the channel and wait for the leader to initialize the channel state.",
    contractState: 1,
  },
  {
    id: 2,
    label: "Transaction",
    description:
      "Exchange off-chain transactions with other participants and submit proofs to update the state.",
    contractState: 2,
  },
  {
    id: 3,
    label: "Close",
    description:
      "The leader is closing the channel. Wait for the final state to be submitted on-chain.",
    contractState: 3,
  },
  {
    id: 4,
    label: "Withdraw",
    description:
      "Channel is closed. You can now withdraw your final balance from the channel.",
    contractState: 4,
  },
];

interface ChannelStepperProps {
  currentState: ContractChannelState | null;
  channelId: string | null;
  userAddress: `0x${string}` | undefined;
  hasWithdrawableAmount?: boolean;
}

export function ChannelStepper({
  currentState,
  channelId,
  userAddress,
  hasWithdrawableAmount = false,
}: ChannelStepperProps) {
  const { tokenSymbol, tokenDecimals } = useToken();
  // Fetch user's deposit amount (only needed for Deposit phase)
  // Updated for new contract: uses getValidatedUserSlotValue with slotIndex 0
  const { data: depositAmount } = useBridgeCoreRead({
    functionName: "getValidatedUserSlotValue",
    args:
      channelId && userAddress
        ? [channelId as `0x${string}`, userAddress, 0]
        : undefined,
    query: {
      enabled: !!channelId && !!userAddress && currentState === 1,
      refetchInterval: 5000,
    },
  });

  // Fetch user's registered MPT key to check if they have deposited
  // A user who deposited (even 0 TON) will have a non-zero MPT key
  // Updated for new contract: requires slotIndex parameter (using 0 for balance slot)
  const { data: registeredMptKey } = useBridgeCoreRead({
    functionName: "getL2MptKey",
    args:
      channelId && userAddress
        ? [channelId as `0x${string}`, userAddress, 0]
        : undefined,
    query: {
      enabled: !!channelId && !!userAddress && currentState === 1,
      refetchInterval: 5000,
    },
  });

  // Check if user has deposited (MPT key is registered)
  const hasDeposited = registeredMptKey !== undefined && registeredMptKey !== BigInt(0);

  // After cleanupChannel, state becomes 0 but withdrawable amounts remain
  // In this case, show the Withdraw step (state 4)
  if (currentState === null) {
    return null;
  }
  
  if (currentState === 0 && !hasWithdrawableAmount) {
    return null;
  }

  // Map contract state to step index (1-based)
  // If state is 0 but hasWithdrawableAmount, show as state 4 (Withdraw)
  const currentStepIndex = currentState === 0 && hasWithdrawableAmount ? 4 : currentState;

  const formattedDeposit =
    depositAmount !== undefined
      ? formatUnits(depositAmount as bigint, tokenDecimals)
      : null;

  // Get current step for description
  const currentStep = STEPS.find((step) => step.contractState === currentStepIndex);

  return (
    <div style={{ width: 544 }}>
      {/* Stepper */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const isCompleted = currentStepIndex > step.contractState;
          const isCurrent = currentStepIndex === step.contractState;

          return (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step Circle + Label */}
              <div className="flex flex-col items-center" style={{ minWidth: 80 }}>
                {/* Circle */}
                <div
                  className={`
                    flex items-center justify-center rounded-full font-mono font-medium
                    transition-all duration-300
                    ${
                      isCompleted
                        ? "bg-[#3EB100] text-white"
                        : isCurrent
                          ? "bg-[#2A72E5] text-white ring-4 ring-[#2A72E5]/20"
                          : "bg-[#E5E5E5] text-[#999999]"
                    }
                  `}
                  style={{
                    width: 40,
                    height: 40,
                    fontSize: 16,
                  }}
                >
                  {isCompleted ? <Check className="w-5 h-5" /> : step.id}
                </div>

                {/* Label */}
                <span
                  className={`
                    mt-2 font-mono text-center whitespace-nowrap
                    ${
                      isCompleted
                        ? "text-[#3EB100] font-medium"
                        : isCurrent
                          ? "text-[#2A72E5] font-medium"
                          : "text-[#999999]"
                    }
                  `}
                  style={{ fontSize: 14 }}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector Line */}
              {index < STEPS.length - 1 && (
                <div
                  className={`
                    flex-1 h-0.5
                    ${
                      currentStepIndex > step.contractState
                        ? "bg-[#3EB100]"
                        : "bg-[#E5E5E5]"
                    }
                  `}
                  style={{ marginTop: -20 }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Current Step Description */}
      {currentStep && (
        <div className="mt-4">
          <p className="font-mono text-[#666666]" style={{ fontSize: 14 }}>
            {currentStep.description}
          </p>

          {/* Show deposit amount only in Deposit phase */}
          {currentStepIndex === 1 && formattedDeposit !== null && (
            <p
              className={`mt-2 font-mono font-medium ${hasDeposited ? "text-[#2A72E5]" : "text-[#E5A02A]"}`}
              style={{ fontSize: 14 }}
            >
              {hasDeposited
                ? `Your Deposit: ${formattedDeposit} ${tokenSymbol}`
                : "⚠ You have not deposited yet"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
