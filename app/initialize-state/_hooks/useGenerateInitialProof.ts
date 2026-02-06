"use client";

import { useCallback, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { readContracts } from "@wagmi/core";
import { useBridgeCoreRead } from "@/hooks/contract";
import { getContractAddress, getContractAbi } from "@tokamak/config";
import { useNetworkId } from "@/hooks/contract/utils";
import {
  generateClientSideProof,
  isClientProofGenerationSupported,
  getMemoryRequirement,
  requiresExternalDownload,
  getDownloadSize,
  type CircuitInput,
} from "@/lib/clientProofGeneration";
import type { ProofData } from "@/stores/useInitializeStore";

// R_MOD constant from BridgeProofManager contract
const R_MOD = BigInt(
  "0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001"
);

interface UseGenerateInitialProofParams {
  channelId: bigint | null;
}

/**
 * Hook for generating initial proof for channel initialization
 */
export function useGenerateInitialProof({
  channelId,
}: UseGenerateInitialProofParams) {
  const { isConnected } = useAccount();
  const config = useConfig();
  const networkId = useNetworkId();
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Convert channelId to hex string for contract calls
  const channelIdHex = channelId ? `0x${channelId.toString(16).padStart(64, '0')}` as `0x${string}` : null;

  // Get channel participants
  const { data: channelParticipants } = useBridgeCoreRead({
    functionName: "getChannelParticipants",
    args: channelIdHex ? [channelIdHex] : undefined,
    query: {
      enabled: !!channelIdHex && isConnected,
    },
  });

  // Get tree size for the selected channel
  const { data: channelTreeSize } = useBridgeCoreRead({
    functionName: "getChannelTreeSize",
    args: channelIdHex ? [channelIdHex] : undefined,
    query: {
      enabled: !!channelIdHex && isConnected,
    },
  });

  // Get target contract for the selected channel
  const { data: channelTargetContract } = useBridgeCoreRead({
    functionName: "getChannelTargetContract",
    args: channelIdHex ? [channelIdHex] : undefined,
    query: {
      enabled: !!channelIdHex && isConnected,
    },
  });

  // Get pre-allocated leaves count for the channel
  const { data: preAllocatedCount } = useBridgeCoreRead({
    functionName: "getChannelPreAllocatedLeavesCount",
    args: channelIdHex ? [channelIdHex] : undefined,
    query: {
      enabled: !!channelIdHex && isConnected,
    },
  });

  // Get pre-allocated keys for the target contract
  const { data: preAllocatedKeys } = useBridgeCoreRead({
    functionName: "getPreAllocatedKeys",
    args: channelTargetContract ? [channelTargetContract as `0x${string}`] : undefined,
    query: {
      enabled: !!channelTargetContract && isConnected,
    },
  });

  const generateProof = useCallback(async (): Promise<ProofData | null> => {
    if (!channelIdHex || !channelParticipants) {
      throw new Error("Missing channel data");
    }

    setIsGenerating(true);
    setError(null);
    setStatus("Collecting channel data...");

    try {
      // Determine required tree size from contract
      const participantCount = (channelParticipants as unknown as `0x${string}`[]).length;
      const preAllocCount = preAllocatedCount ? Number(preAllocatedCount) : 0;

      // Determine tree size from contract
      let treeSize: number;
      if (channelTreeSize) {
        treeSize = Number(channelTreeSize);
      } else {
        const totalEntries = participantCount + preAllocCount;
        const minTreeSize = Math.max(
          16,
          Math.min(128, 2 ** Math.ceil(Math.log2(totalEntries)))
        );
        treeSize = [16, 32, 64, 128].find((size) => size >= minTreeSize) || 128;
      }

      // Validate tree size is supported
      if (![16, 32, 64, 128].includes(treeSize)) {
        throw new Error(
          `Unsupported tree size: ${treeSize}. Channel tree size from contract: ${channelTreeSize}`
        );
      }

      setStatus(
        `Collecting data for ${treeSize}-leaf merkle tree (${preAllocCount} pre-allocated + ${participantCount} participants)...`
      );

      // Collect storage keys (L2 MPT keys) and values (deposits)
      const storageKeysL2MPT: string[] = [];
      const storageValues: string[] = [];

      // STEP 1: Add pre-allocated leaves data FIRST
      if (preAllocCount > 0 && preAllocatedKeys && channelTargetContract) {
        setStatus(`Fetching ${preAllocCount} pre-allocated leaves...`);

        const preAllocatedKeysList = preAllocatedKeys as unknown as `0x${string}`[];
        try {
          const bridgeCoreAddress = getContractAddress("BridgeCore", networkId);
          const bridgeCoreAbi = getContractAbi("BridgeCore");

          const preAllocatedResults = await readContracts(config, {
            contracts: preAllocatedKeysList.map((key) => ({
              address: bridgeCoreAddress,
              abi: bridgeCoreAbi,
              functionName: "getPreAllocatedLeaf",
              args: [channelTargetContract, key],
            })),
          });

          preAllocatedResults.forEach((result, i) => {
            const key = preAllocatedKeysList[i];

            if (!result || result.status === "failure" || !result.result) {
              console.log(
                `Skipping pre-allocated leaf ${i} (doesn't exist or failed to fetch)`
              );
              return;
            }

            const [value, exists] = result.result as [bigint, boolean];

            if (exists) {
              // Apply modulo R_MOD as the contract does
              const modedKey = (BigInt(key) % R_MOD).toString();
              const modedValue = (value % R_MOD).toString();

              storageKeysL2MPT.push(modedKey);
              storageValues.push(modedValue);

              console.log(
                `Pre-allocated leaf ${i}: key=${key} -> ${modedKey}, value=${value.toString()} -> ${modedValue}`
              );
            }
          });
        } catch (error) {
          console.error("Failed to fetch pre-allocated leaves:", error);
        }
      }

      // STEP 2: Add participant data AFTER pre-allocated leaves
      setStatus(`Processing ${participantCount} participants...`);

      const participants = channelParticipants as unknown as `0x${string}`[];
      const bridgeCoreAddress = getContractAddress("BridgeCore", networkId);
      const bridgeCoreAbi = getContractAbi("BridgeCore");

      // Get balance slot index from target contract
      let balanceSlotIndex = 0;
      if (channelTargetContract) {
        const slotIndexResult = await readContracts(config, {
          contracts: [
            {
              address: bridgeCoreAddress,
              abi: bridgeCoreAbi,
              functionName: "getBalanceSlotIndex",
              args: [channelTargetContract as `0x${string}`],
            },
          ],
        });
        if (slotIndexResult[0]?.status === "success") {
          balanceSlotIndex = Number(slotIndexResult[0].result);
        }
      }

      for (
        let i = 0;
        i < participants.length && storageKeysL2MPT.length < treeSize;
        i++
      ) {
        const participant = participants[i];

        setStatus(`Processing participant ${i + 1} of ${participantCount}...`);

        let l2MptKey = "0";
        let deposit = "0";

        try {
          const [l2MptKeyResult, depositResult] = await readContracts(config, {
            contracts: [
              {
                address: bridgeCoreAddress,
                abi: bridgeCoreAbi,
                functionName: "getL2MptKey",
                args: [channelIdHex!, participant, balanceSlotIndex],
              },
              {
                address: bridgeCoreAddress,
                abi: bridgeCoreAbi,
                functionName: "getParticipantDeposit",
                args: [channelIdHex!, participant],
              },
            ],
          });

          if (
            l2MptKeyResult?.status === "success" &&
            l2MptKeyResult.result !== undefined
          ) {
            l2MptKey = (l2MptKeyResult.result as bigint).toString();
          } else {
            console.error(`L2 MPT key fetch failed for ${participant}`);
          }

          if (
            depositResult?.status === "success" &&
            depositResult.result !== undefined
          ) {
            deposit = (depositResult.result as bigint).toString();
          } else {
            console.error(`Deposit fetch failed for ${participant}`);
          }

          // Apply modulo R_MOD as the contract does
          const modedL2MptKey =
            l2MptKey !== "0" ? (BigInt(l2MptKey) % R_MOD).toString() : "0";
          const modedBalance =
            deposit !== "0" ? (BigInt(deposit) % R_MOD).toString() : "0";

          storageKeysL2MPT.push(modedL2MptKey);
          storageValues.push(modedBalance);

          console.log(
            `Participant ${i}: key=${l2MptKey} -> ${modedL2MptKey}, balance=${deposit} -> ${modedBalance}`
          );
        } catch (error) {
          console.error(`Failed to get data for ${participant}:`, error);
          throw error;
        }
      }

      // STEP 3: Fill remaining entries with zeros
      while (storageKeysL2MPT.length < treeSize) {
        storageKeysL2MPT.push("0");
        storageValues.push("0");
      }

      setStatus("Preparing circuit input...");

      console.log("🔍 PROOF GENERATION DEBUG:");
      console.log("  Channel ID:", channelId?.toString());
      console.log("  Channel Tree Size:", channelTreeSize);
      console.log("  Pre-allocated Count:", preAllocCount);
      console.log("  Participant Count:", participantCount);
      console.log("  Total Entries:", storageKeysL2MPT.length);
      console.log("  Requested Tree Size:", treeSize);

      const circuitInput: CircuitInput = {
        storage_keys_L2MPT: storageKeysL2MPT,
        storage_values: storageValues,
        treeSize: treeSize,
      };

      // Check if client-side proof generation is supported
      if (!isClientProofGenerationSupported()) {
        throw new Error(
          "Client-side proof generation is not supported in this browser. Please try a modern browser with WebAssembly support."
        );
      }

      const memoryReq = getMemoryRequirement(treeSize);
      const needsDownload = requiresExternalDownload(treeSize);
      const downloadInfo = needsDownload
        ? ` + ${getDownloadSize(treeSize)} download`
        : "";
      setStatus(
        `Generating Groth16 proof for ${treeSize}-leaf tree (${memoryReq}${downloadInfo}, this may take a few minutes)...`
      );

      // Generate proof client-side using snarkjs
      const result = await generateClientSideProof(circuitInput, (status) => {
        setStatus(status);
      });

      console.log("🔍 PROOF RESULT DEBUG:");
      console.log("  Generated Proof:", result.proof);
      console.log("  Public Signals:", result.publicSignals);
      console.log("  Merkle Root:", result.proof.merkleRoot);

      setStatus("Proof generated successfully!");

      // Convert to ProofData format
      const proofData: ProofData = {
        pA: [
          result.proof.pA[0],
          result.proof.pA[1],
          result.proof.pA[2],
          result.proof.pA[3],
        ],
        pB: [
          result.proof.pB[0],
          result.proof.pB[1],
          result.proof.pB[2],
          result.proof.pB[3],
          result.proof.pB[4],
          result.proof.pB[5],
          result.proof.pB[6],
          result.proof.pB[7],
        ],
        pC: [
          result.proof.pC[0],
          result.proof.pC[1],
          result.proof.pC[2],
          result.proof.pC[3],
        ],
        merkleRoot: result.proof.merkleRoot,
      };

      setIsGenerating(false);
      return proofData;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      setIsGenerating(false);
      setStatus(`Error: ${errorMessage}`);
      throw err;
    }
  }, [
    channelIdHex,
    channelParticipants,
    channelTreeSize,
    channelTargetContract,
    preAllocatedCount,
    preAllocatedKeys,
    config,
    networkId,
  ]);

  return {
    generateProof,
    isGenerating,
    status,
    error,
  };
}
