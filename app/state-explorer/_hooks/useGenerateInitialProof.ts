"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
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
  channelId: `0x${string}` | null; // Changed to bytes32
}

/**
 * Hook for generating initial proof for channel initialization
 */
export function useGenerateInitialProof({
  channelId,
}: UseGenerateInitialProofParams) {
  const { isConnected } = useAccount();
  const publicClient = usePublicClient();
  const networkId = useNetworkId();
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Get channel participants (uses bytes32 directly)
  const { 
    data: channelParticipants,
    isLoading: isLoadingParticipants,
    isFetching: isFetchingParticipants,
  } = useBridgeCoreRead({
    functionName: "getChannelParticipants",
    args: channelId ? [channelId] : undefined,
    query: {
      enabled: !!channelId && isConnected,
    },
  });

  // Get tree size for the selected channel (uses bytes32 directly)
  const { 
    data: channelTreeSize,
    isLoading: isLoadingTreeSize,
    isFetching: isFetchingTreeSize,
  } = useBridgeCoreRead({
    functionName: "getChannelTreeSize",
    args: channelId ? [channelId] : undefined,
    query: {
      enabled: !!channelId && isConnected,
    },
  });

  // Get target contract for the selected channel (uses bytes32 directly)
  const { 
    data: channelTargetContract,
    isLoading: isLoadingTargetContract,
    isFetching: isFetchingTargetContract,
  } = useBridgeCoreRead({
    functionName: "getChannelTargetContract",
    args: channelId ? [channelId] : undefined,
    query: {
      enabled: !!channelId && isConnected,
    },
  });

  // Get pre-allocated leaves count for the channel (uses bytes32 directly)
  const { 
    data: preAllocatedCount,
    isLoading: isLoadingPreAllocCount,
    isFetching: isFetchingPreAllocCount,
  } = useBridgeCoreRead({
    functionName: "getChannelPreAllocatedLeavesCount",
    args: channelId ? [channelId] : undefined,
    query: {
      enabled: !!channelId && isConnected,
    },
  });

  // Get pre-allocated keys for the target contract
  const { 
    data: preAllocatedKeys,
    isLoading: isLoadingPreAllocKeys,
    isFetching: isFetchingPreAllocKeys,
  } = useBridgeCoreRead({
    functionName: "getPreAllocatedKeys",
    args: channelTargetContract ? [channelTargetContract as `0x${string}`] : undefined,
    query: {
      enabled: !!channelTargetContract && isConnected,
    },
  });

  // Calculate if channel data is still loading
  // We need at least channelParticipants to be loaded before we can proceed
  const isLoadingChannelData = 
    isLoadingParticipants || 
    isFetchingParticipants ||
    isLoadingTreeSize ||
    isFetchingTreeSize ||
    isLoadingTargetContract ||
    isFetchingTargetContract ||
    isLoadingPreAllocCount ||
    isFetchingPreAllocCount ||
    (!!channelTargetContract && (isLoadingPreAllocKeys || isFetchingPreAllocKeys));

  const generateProof = useCallback(async (): Promise<ProofData | null> => {
    if (!channelId) {
      throw new Error("Channel ID is required");
    }

    if (!publicClient) {
      throw new Error("Public client not available");
    }

    setIsGenerating(true);
    setError(null);
    setStatus("Fetching fresh channel data from blockchain...");

    try {
      const bridgeCoreAddress = getContractAddress("BridgeCore", networkId);
      const bridgeCoreAbi = getContractAbi("BridgeCore");

      // IMPORTANT: Fetch ALL channel data directly from blockchain to avoid React Query cache issues
      // This ensures we always use the latest data after deposits
      const [
        freshParticipants,
        freshTreeSize,
        freshTargetContract,
        freshPreAllocCount,
      ] = await Promise.all([
        publicClient.readContract({
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getChannelParticipants",
          args: [channelId],
        }),
        publicClient.readContract({
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getChannelTreeSize",
          args: [channelId],
        }),
        publicClient.readContract({
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getChannelTargetContract",
          args: [channelId],
        }),
        publicClient.readContract({
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getChannelPreAllocatedLeavesCount",
          args: [channelId],
        }),
      ]);

      const participants = freshParticipants as `0x${string}`[];
      const participantCount = participants.length;
      const preAllocCount = freshPreAllocCount ? Number(freshPreAllocCount) : 0;
      const targetContract = freshTargetContract as `0x${string}`;

      // Fetch pre-allocated keys if target contract exists
      let preAllocatedKeysList: `0x${string}`[] = [];
      let preAllocatedLeavesFromTargetData: Array<{ key: `0x${string}`; value: bigint }> = [];
      
      if (targetContract && targetContract !== "0x0000000000000000000000000000000000000000") {
        const freshPreAllocKeys = await publicClient.readContract({
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getPreAllocatedKeys",
          args: [targetContract],
        });
        preAllocatedKeysList = (freshPreAllocKeys as `0x${string}`[]) || [];
        
        // WORKAROUND: getPreAllocatedKeys() returns empty for some contracts (e.g., USDT)
        // Use getTargetContractData() as fallback until contract is upgraded
        if (preAllocatedKeysList.length === 0) {
          console.warn("[useGenerateInitialProof] getPreAllocatedKeys() returned empty, trying getTargetContractData() fallback");
          
          type PreAllocatedLeafStruct = {
            value: bigint;
            key: `0x${string}`;
            isActive: boolean;
          };
          
          type TargetContractData = {
            preAllocatedLeaves: readonly PreAllocatedLeafStruct[];
            registeredFunctions: readonly unknown[];
            userStorageSlots: readonly unknown[];
          };
          
          const targetContractData = await publicClient.readContract({
            address: bridgeCoreAddress,
            abi: bridgeCoreAbi,
            functionName: "getTargetContractData",
            args: [targetContract],
          }) as TargetContractData;
          
          if (targetContractData?.preAllocatedLeaves && targetContractData.preAllocatedLeaves.length > 0) {
            console.log("[useGenerateInitialProof] Found preAllocatedLeaves from getTargetContractData():", 
              targetContractData.preAllocatedLeaves.length);
            
            targetContractData.preAllocatedLeaves.forEach((leaf) => {
              if (leaf.isActive) {
                preAllocatedKeysList.push(leaf.key);
                preAllocatedLeavesFromTargetData.push({ key: leaf.key, value: leaf.value });
              }
            });
            
            console.log("[useGenerateInitialProof] Extracted active preAllocatedLeaves:", preAllocatedKeysList.length);
          }
        }
      }

      console.log("🔄 Fresh data fetched from blockchain:");
      console.log("  Participants:", participants);
      console.log("  Tree Size:", freshTreeSize);
      console.log("  Target Contract:", targetContract);
      console.log("  Pre-allocated Count:", preAllocCount);
      console.log("  Pre-allocated Keys:", preAllocatedKeysList);

      // Determine tree size from contract
      let treeSize: number;
      if (freshTreeSize) {
        treeSize = Number(freshTreeSize);
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
          `Unsupported tree size: ${treeSize}. Channel tree size from contract: ${freshTreeSize}`
        );
      }

      setStatus(
        `Collecting data for ${treeSize}-leaf merkle tree (${preAllocCount} pre-allocated + ${participantCount} participants)...`
      );

      // Collect storage keys (L2 MPT keys) and values (deposits)
      const storageKeysL2MPT: string[] = [];
      const storageValues: string[] = [];

      // STEP 1: Add pre-allocated leaves data FIRST
      // IMPORTANT: Must check preAllocCount (per-channel) NOT preAllocatedKeysList.length (per-target-contract)
      // A channel with preAllocCount=0 should NOT include pre-allocated leaves even if the
      // target contract has pre-allocated keys registered globally
      if (preAllocCount > 0 && preAllocatedKeysList.length > 0 && targetContract) {
        setStatus(`Fetching ${preAllocatedKeysList.length} pre-allocated leaves...`);

        try {
          if (preAllocatedLeavesFromTargetData.length > 0) {
            // DO NOT sort: must match the order returned by getPreAllocatedKeys() on-chain,
            // which is the order the contract's initializeChannelState iterates
            console.log("🔑 Using preAllocatedLeaves in original order:", preAllocatedLeavesFromTargetData.map(l => l.key));

            // Use data already fetched from getTargetContractData() (workaround path)
            preAllocatedLeavesFromTargetData.forEach((leaf, i) => {
              const modedKey = (BigInt(leaf.key) % R_MOD).toString();
              const modedValue = (leaf.value % R_MOD).toString();

              storageKeysL2MPT.push(modedKey);
              storageValues.push(modedValue);

              console.log(
                `Pre-allocated leaf ${i}: key=${leaf.key} -> ${modedKey}, value=${leaf.value.toString()} -> ${modedValue}`
              );
            });
          } else {
            // DO NOT sort: must match the order returned by getPreAllocatedKeys() on-chain
            console.log("🔑 Using preAllocatedKeys in original order:", preAllocatedKeysList);

            // Use getPreAllocatedLeaf() for each key (normal path)
            const preAllocatedResults = await Promise.all(
              preAllocatedKeysList.map((key) =>
                publicClient.readContract({
                  address: bridgeCoreAddress,
                  abi: bridgeCoreAbi,
                  functionName: "getPreAllocatedLeaf",
                  args: [targetContract, key],
                })
              )
            );

            preAllocatedResults.forEach((result: unknown, i: number) => {
              const key = preAllocatedKeysList[i];

              if (!result) {
                console.log(
                  `Skipping pre-allocated leaf ${i} (doesn't exist or failed to fetch)`
                );
                return;
              }

              const [value, exists] = result as [bigint, boolean];

              if (exists) {
                const modedKey = (BigInt(key) % R_MOD).toString();
                const modedValue = (value % R_MOD).toString();

                storageKeysL2MPT.push(modedKey);
                storageValues.push(modedValue);

                console.log(
                  `Pre-allocated leaf ${i}: key=${key} -> ${modedKey}, value=${value.toString()} -> ${modedValue}`
                );
              }
            });
          }
        } catch (error) {
          console.error("Failed to fetch pre-allocated leaves:", error);
        }
      }

      // Get user storage slots from target contract (need full slot info for isLoadedOnChain)
      type UserStorageSlotInfo = {
        slotOffset: number;
        getterFunctionSignature: `0x${string}`;
        isLoadedOnChain: boolean;
      };
      let userStorageSlots: UserStorageSlotInfo[] = [{ slotOffset: 0, getterFunctionSignature: "0x0000000000000000000000000000000000000000000000000000000000000000", isLoadedOnChain: false }];
      try {
        const targetContractData = await publicClient.readContract({
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getTargetContractData",
          args: [targetContract],
        }) as { userStorageSlots: UserStorageSlotInfo[] };
        if (targetContractData.userStorageSlots?.length > 0) {
          userStorageSlots = targetContractData.userStorageSlots;
        }
        console.log(`📊 Target contract has ${userStorageSlots.length} user storage slots:`,
          userStorageSlots.map((s, i) => `[${i}] offset=${s.slotOffset} onChain=${s.isLoadedOnChain}`));
      } catch (error) {
        console.warn("Failed to get target contract data, defaulting to 1 slot:", error);
      }
      const numSlots = userStorageSlots.length;

      // STEP 2: Add participant data AFTER pre-allocated leaves
      // IMPORTANT: Loop order must match contract's initializeChannelState:
      // Contract iterates: slot -> participant (outer: slots, inner: participants)
      setStatus(`Processing ${participantCount} participants with ${numSlots} slots each...`);

      for (let slotIndex = 0; slotIndex < numSlots && storageKeysL2MPT.length < treeSize; slotIndex++) {
        const slot = userStorageSlots[slotIndex];
        setStatus(`Processing slot ${slotIndex + 1} of ${numSlots}${slot.isLoadedOnChain ? " (on-chain)" : ""}...`);

        for (
          let i = 0;
          i < participants.length && storageKeysL2MPT.length < treeSize;
          i++
        ) {
          const participant = participants[i];
          let l2MptKey = "0";
          let slotValue = "0";

          try {
            if (slot.isLoadedOnChain) {
              // On-chain slot: fetch L2 MPT key from BridgeCore and value via
              // staticcall to target contract's getter function (matches contract logic)
              const l2MptKeyResultRaw = await publicClient.readContract({
                address: bridgeCoreAddress,
                abi: bridgeCoreAbi,
                functionName: "getL2MptKey",
                args: [channelId, participant, slotIndex],
              });

              if (l2MptKeyResultRaw !== undefined) {
                l2MptKey = (l2MptKeyResultRaw as bigint).toString();
              }

              // Call target contract's getter function with participant address
              // Must exactly match contract's encoding: abi.encodePacked(bytes32 getterFunctionSignature, abi.encode(address))
              // = full 32-byte signature (not just 4-byte selector) + 32-byte encoded address
              const sigWithout0x = slot.getterFunctionSignature.slice(2); // 64 hex chars (32 bytes)
              const encodedAddr = participant.slice(2).padStart(64, "0"); // 64 hex chars (32 bytes)
              try {
                const callResult = await publicClient.call({
                  to: targetContract,
                  data: `0x${sigWithout0x}${encodedAddr}` as `0x${string}`,
                });
                if (callResult.data && callResult.data.length >= 66) {
                  slotValue = BigInt(callResult.data).toString();
                }
              } catch (callError) {
                console.warn(`On-chain getter call failed for ${participant} slot ${slotIndex}, using 0:`, callError);
                slotValue = "0";
              }

              console.log(
                `Slot ${slotIndex} participant ${i} (on-chain): key=${l2MptKey}, value=${slotValue}`
              );
            } else {
              // Balance slot: fetch from BridgeCore (deposit value)
              const [l2MptKeyResultRaw, slotValueResultRaw] = await Promise.all([
                publicClient.readContract({
                  address: bridgeCoreAddress,
                  abi: bridgeCoreAbi,
                  functionName: "getL2MptKey",
                  args: [channelId, participant, slotIndex],
                }),
                publicClient.readContract({
                  address: bridgeCoreAddress,
                  abi: bridgeCoreAbi,
                  functionName: "getValidatedUserSlotValue",
                  args: [channelId, participant, slotIndex],
                }),
              ]);

              if (l2MptKeyResultRaw !== undefined) {
                l2MptKey = (l2MptKeyResultRaw as bigint).toString();
              }

              if (slotValueResultRaw !== undefined) {
                slotValue = (slotValueResultRaw as bigint).toString();
              }
            }

            const modedL2MptKey =
              l2MptKey !== "0" ? (BigInt(l2MptKey) % R_MOD).toString() : "0";
            const modedSlotValue =
              slotValue !== "0" ? (BigInt(slotValue) % R_MOD).toString() : "0";

            storageKeysL2MPT.push(modedL2MptKey);
            storageValues.push(modedSlotValue);

            console.log(
              `Slot ${slotIndex} participant ${i}: key=${l2MptKey} -> ${modedL2MptKey}, value=${slotValue} -> ${modedSlotValue}`
            );
          } catch (error) {
            console.error(`Failed to get data for ${participant} slot ${slotIndex}:`, error);
            throw error;
          }
        }
      }

      // STEP 3: Fill remaining entries with zeros
      while (storageKeysL2MPT.length < treeSize) {
        storageKeysL2MPT.push("0");
        storageValues.push("0");
      }

      setStatus("Preparing circuit input...");

      console.log("🔍 PROOF GENERATION DEBUG:");
      console.log("  Channel ID:", channelId);
      console.log("  Channel Tree Size:", freshTreeSize);
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
    channelId,
    publicClient,
    networkId,
  ]);

  return {
    generateProof,
    isGenerating,
    isLoadingChannelData,
    status,
    error,
  };
}
