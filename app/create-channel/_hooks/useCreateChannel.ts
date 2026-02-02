/**
 * useCreateChannel Hook
 *
 * Hook for creating a channel with contract interaction
 */

import { useState, useEffect, useCallback } from "react";
import { decodeEventLog, getEventSelector } from "viem";
import {
  useBridgeCoreWrite,
  useBridgeCoreWaitForReceipt,
  useBridgeCoreAbi,
} from "@/hooks/contract";
import { SUPPORTED_TOKENS, type TokenSymbol } from "@tokamak/config";
import { saveChannelToDatabase, type AppType } from "../_utils/saveChannel";

export type CreateChannelStep =
  | "idle"
  | "signing"
  | "confirming"
  | "completed"
  | "error";

interface UseCreateChannelParams {
  participants: Array<{ address: `0x${string}` }>;
  isValid: () => boolean;
  isConnected: boolean;
  channelId: `0x${string}` | null;
  appType?: AppType;
  /** Selected tokens for multi-token support */
  selectedTokens?: TokenSymbol[];
}

export function useCreateChannel({
  participants,
  isValid,
  isConnected,
  channelId,
  appType,
  selectedTokens = ["TON"],
}: UseCreateChannelParams) {
  // Get primary target contract (first selected token)
  const primaryTargetContract = SUPPORTED_TOKENS[selectedTokens[0]]?.address;
  const [isCreating, setIsCreating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdChannelId, setCreatedChannelId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<CreateChannelStep>("idle");

  // Contract write hook (address and abi are pre-configured)
  const {
    writeContract,
    isPending: isWriting,
    data: writeTxHash,
    error: writeError,
  } = useBridgeCoreWrite();

  // Wait for transaction confirmation
  const {
    isLoading: isWaiting,
    isSuccess,
    data: receipt,
    error: waitError,
  } = useBridgeCoreWaitForReceipt({
    hash: writeTxHash,
    query: {
      enabled: !!writeTxHash,
      retry: true,
    },
  });

  // Get ABI for decoding
  const abi = useBridgeCoreAbi();

  useEffect(() => {
    console.log("📊 writeContract state:", { isWriting, writeError: writeError?.message, writeTxHash });
  }, [isWriting, writeError, writeTxHash]);

  useEffect(() => {
    console.log("📊 waitForReceipt state:", { isWaiting, isSuccess, waitError: waitError?.message, hasReceipt: !!receipt });
  }, [isWaiting, isSuccess, waitError, receipt]);

  // Update states based on contract hooks
  useEffect(() => {
    setIsCreating(isWriting);
    // When writing starts (pending signature), move to signing step
    if (isWriting && currentStep === "idle") {
      setCurrentStep("signing");
    }
  }, [isWriting, currentStep]);

  useEffect(() => {
    setIsConfirming(isWaiting);
  }, [isWaiting]);

  // When txHash is received, user has signed - move to confirming step
  useEffect(() => {
    if (writeTxHash) {
      setTxHash(writeTxHash);
      if (currentStep === "signing") {
        setCurrentStep("confirming");
      }
    }
  }, [writeTxHash, currentStep]);

  useEffect(() => {
    if (writeError) {
      console.error("❌ writeError:", writeError);
      setError(writeError.message);
      setIsCreating(false);
      setCurrentStep("error");
    } else if (waitError) {
      console.error("❌ waitError:", waitError);
      setError(waitError.message);
      setIsConfirming(false);
      setIsCreating(false);
      setCurrentStep("error");
    }
  }, [writeError, waitError]);

  // Handle successful channel creation
  const handleChannelCreated = useCallback(async () => {
    if (!receipt || !isSuccess) return;

    try {
      let channelIdBytes32: `0x${string}` | null = null;

      // Get ChannelOpened event selector for filtering
      // Event signature: ChannelOpened(bytes32 indexed channelId, address targetContract)
      const channelOpenedSelector = getEventSelector(
        "ChannelOpened(bytes32,address)"
      );

      // Look for ChannelOpened event in the logs
      if (receipt.logs && receipt.logs.length > 0) {
        console.log(
          `🔍 Searching for ChannelOpened event in ${receipt.logs.length} logs...`
        );

        for (const log of receipt.logs) {
          // Filter by event selector (first topic)
          if (log.topics && log.topics[0] === channelOpenedSelector) {
            try {
              const decoded = decodeEventLog({
                abi: abi,
                data: log.data,
                topics: log.topics,
                eventName: "ChannelOpened",
              });

              console.log("✅ Decoded ChannelOpened event:", decoded);

              if (
                decoded.eventName === "ChannelOpened" &&
                decoded.args &&
                typeof decoded.args === "object" &&
                "channelId" in decoded.args
              ) {
                const args = decoded.args as { channelId: `0x${string}` };
                if (
                  typeof args.channelId === "string" &&
                  args.channelId.startsWith("0x")
                ) {
                  channelIdBytes32 = args.channelId as `0x${string}`;
                  console.log(
                    `✅ Found channel ID (bytes32): ${channelIdBytes32}`
                  );
                  break;
                }
              }
            } catch (e) {
              console.error("❌ Error decoding ChannelOpened event:", e);
              // Continue to next log
              continue;
            }
          }
        }
      } else {
        console.warn("⚠️ No logs found in transaction receipt");
      }

      if (channelIdBytes32 === null) {
        console.error(
          "❌ ChannelOpened event not found. Receipt logs:",
          receipt.logs
        );
        throw new Error("ChannelOpened event not found in transaction logs");
      }

      // Convert bytes32 channelId to string for storage
      // Note: channelId is bytes32, we'll use it as hex string
      const channelIdStr = channelIdBytes32;
      // Filter out empty addresses for DB save
      const validParticipants = participants.filter(
        (p) =>
          p.address &&
          p.address.length > 0 &&
          /^0x[a-fA-F0-9]{40}$/.test(p.address)
      );

      console.log("[useCreateChannel] Preparing to save channel to database:", {
        channelIdStr,
        txHash: receipt.transactionHash,
        primaryTargetContract,
        validParticipants: validParticipants.map((p) => p.address),
        blockNumber: receipt.blockNumber.toString(),
        appType,
        selectedTokens,
      });

      try {
        await saveChannelToDatabase({
          channelId: channelIdStr,
          txHash: receipt.transactionHash,
          targetContract: primaryTargetContract,
          participants: validParticipants.map((p) => p.address),
          blockNumber: receipt.blockNumber.toString(),
          appType,
          selectedTokens,
        });
        console.log("[useCreateChannel] Channel saved to database successfully");
      } catch (dbError) {
        console.error("[useCreateChannel] Error saving channel to database:", dbError);
      }

      // Set created channel ID and transaction hash
      setCreatedChannelId(channelIdStr);
      setTxHash(receipt.transactionHash); // Ensure txHash is set from receipt
      setIsConfirming(false);
      setIsCreating(false);
      setCurrentStep("completed");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to extract channel ID from transaction";
      setError(errorMessage);
      setIsConfirming(false);
      setIsCreating(false);
      setCurrentStep("error");
    }
  }, [receipt, isSuccess, abi, participants, appType, selectedTokens, primaryTargetContract]);

  useEffect(() => {
    console.log("[useCreateChannel] Receipt effect triggered:", {
      hasReceipt: !!receipt,
      isSuccess,
      isWaiting,
      waitError: waitError?.message,
    });
    if (receipt && isSuccess) {
      console.log("[useCreateChannel] Calling handleChannelCreated with receipt:", receipt.transactionHash);
      handleChannelCreated();
    }
  }, [receipt, isSuccess, handleChannelCreated, isWaiting, waitError]);

  // Create channel function
  const createChannel = useCallback(async () => {
    console.log("🎬 createChannel called");
    console.log("📋 Validation check:", {
      isConnected,
      channelId,
      primaryTargetContract,
      participantsCount: participants.length,
    });

    if (!isConnected) {
      console.log("❌ Validation failed: wallet not connected");
      setError("Please connect your wallet");
      return;
    }

    // Filter out empty addresses
    const validParticipants = participants.filter(
      (p) =>
        p.address &&
        p.address.length > 0 &&
        /^0x[a-fA-F0-9]{40}$/.test(p.address)
    );

    console.log("📋 Participants validation:", {
      original: participants.map((p, i) => ({ index: i, address: p.address, isValid: /^0x[a-fA-F0-9]{40}$/.test(p.address) })),
      validCount: validParticipants.length,
    });

    if (validParticipants.length < 2) {
      console.log("❌ Validation failed: not enough participants", validParticipants.length);
      setError("Please add at least 2 valid participant addresses");
      return;
    }

    if (!channelId) {
      console.log("❌ Validation failed: no channelId");
      setError("Please generate a channel ID first");
      return;
    }

    if (!primaryTargetContract) {
      console.log("❌ Validation failed: no primaryTargetContract");
      setError("Please select at least one token");
      return;
    }

    try {
      setError(null);
      setIsCreating(true);
      setCreatedChannelId(null);

      const channelParams = {
        channelId: channelId,
        targetContract: primaryTargetContract,
        whitelisted: validParticipants.map((p) => p.address),
        enableFrostSignature: false,
      };

      console.log("🚀 Creating channel with params:", {
        channelId,
        targetContract: primaryTargetContract,
        selectedTokens,
        whitelisted: validParticipants.map((p) => p.address),
        enableFrostSignature: false,
        channelParams,
      });

      console.log("📝 Calling writeContract...");
      
      writeContract({
        functionName: "openChannel",
        args: [channelParams],
      });
      
      console.log("✅ writeContract called");
    } catch (error) {
      console.error("❌ Error in createChannel:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create channel";
      setError(errorMessage);
      setIsCreating(false);
    }
  }, [isConnected, participants, channelId, writeContract, primaryTargetContract]);

  // Reset function
  const reset = useCallback(() => {
    setIsCreating(false);
    setIsConfirming(false);
    setError(null);
    setCreatedChannelId(null);
    setTxHash("");
    setCurrentStep("idle");
  }, []);

  return {
    createChannel,
    isCreating,
    isConfirming,
    error,
    createdChannelId,
    txHash,
    currentStep,
    reset,
  };
}
