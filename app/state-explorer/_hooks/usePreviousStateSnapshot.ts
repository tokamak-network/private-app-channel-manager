/**
 * Hook to get previous state snapshot for a channel
 *
 * This hook fetches the previous state snapshot in the following order:
 * 1. From bundleData (if available)
 * 2. From API (latest verified proof)
 * 3. From on-chain (initial state for first transfer)
 */

import { useState, useCallback } from "react";
import { useConfig } from "wagmi";
import {
  useBridgeCoreAddress,
  useBridgeCoreAbi,
  readBridgeCoreContract,
} from "@/hooks/contract";
import { StateSnapshot } from "tokamak-l2js";
import { addHexPrefix } from "@ethereumjs/util";
import { normalizeStateSnapshot } from "@/lib/stateSnapshotCompat";

interface UsePreviousStateSnapshotParams {
  channelId: string | null;
  bundleSnapshot?: StateSnapshot | null;
}

interface UsePreviousStateSnapshotReturn {
  previousStateSnapshot: StateSnapshot | null;
  isLoading: boolean;
  error: string | null;
  fetchSnapshot: () => Promise<StateSnapshot | null>;
}

/**
 * Hook to fetch previous state snapshot for a channel
 */
export function usePreviousStateSnapshot({
  channelId,
  bundleSnapshot,
}: UsePreviousStateSnapshotParams): UsePreviousStateSnapshotReturn {
  const config = useConfig();
  const bridgeCoreAddress = useBridgeCoreAddress();
  const bridgeCoreAbi = useBridgeCoreAbi();
  const [previousStateSnapshot, setPreviousStateSnapshot] =
    useState<StateSnapshot | null>(bundleSnapshot || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async (): Promise<StateSnapshot | null> => {
    if (!channelId) {
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Use bundleSnapshot if available
      if (bundleSnapshot) {
        setPreviousStateSnapshot(bundleSnapshot);
        setIsLoading(false);
        return bundleSnapshot;
      }

      // Step 2: Try to get from latest verified proof API
      let apiSnapshot: StateSnapshot | null = null;
      try {
        console.log("[usePreviousStateSnapshot] Step 2: Calling API with channelId:", channelId);
        const response = await fetch(
          `/api/get-latest-state-snapshot?channelId=${channelId}`
        );
        console.log("[usePreviousStateSnapshot] API response status:", response.status, response.ok);
        
        if (response.ok) {
          const data = await response.json();
          console.log("[usePreviousStateSnapshot] API response data:", {
            success: data.success,
            hasSnapshot: !!data.snapshot,
            proofId: data.proofId,
            sequenceNumber: data.sequenceNumber,
          });
          
          if (data.snapshot) {
            apiSnapshot = normalizeStateSnapshot(data.snapshot);
            console.log("[usePreviousStateSnapshot] API snapshot details:", {
              stateRoots: apiSnapshot?.stateRoots,
              storageEntriesCount: apiSnapshot?.storageEntries?.[0]?.length,
              storageEntries: apiSnapshot?.storageEntries?.[0],
              hasPreAllocatedLeaves: !!(apiSnapshot?.preAllocatedLeaves?.[0]?.length),
            });
            
            // Check if preAllocatedLeaves is missing or empty
            if (apiSnapshot) {
              const hasPreAllocatedLeaves =
                apiSnapshot.preAllocatedLeaves &&
                Array.isArray(apiSnapshot.preAllocatedLeaves) &&
                apiSnapshot.preAllocatedLeaves.length > 0 &&
                apiSnapshot.preAllocatedLeaves[0]?.length > 0;

              if (hasPreAllocatedLeaves) {
                // Snapshot has preAllocatedLeaves, use it
                console.log("[usePreviousStateSnapshot] Using API snapshot directly (has preAllocatedLeaves)");
                setPreviousStateSnapshot(apiSnapshot);
                setIsLoading(false);
                return apiSnapshot;
              } else {
                // Snapshot is missing preAllocatedLeaves, will fetch from on-chain in Step 3
                console.warn(
                  "[usePreviousStateSnapshot] Snapshot from API missing preAllocatedLeaves, will fetch from on-chain and merge"
                );
              }
            }
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.warn("[usePreviousStateSnapshot] API returned non-ok status:", {
            status: response.status,
            error: errorData.error,
          });
        }
      } catch (apiError) {
        console.warn("[usePreviousStateSnapshot] Failed to fetch snapshot from API:", apiError);
      }

      // Step 3: Fetch from on-chain
      // If apiSnapshot exists but is missing preAllocatedLeaves, merge it with on-chain data
      // Otherwise, fetch everything from on-chain (first transfer simulation)
      const channelIdBytes32 = channelId.startsWith("0x")
        ? (channelId as `0x${string}`)
        : (`0x${channelId}` as `0x${string}`);

      // Get channel info, participants, and pre-allocated count using common contract hook
      const [channelInfo, participants, channelPreAllocCount] = await Promise.all([
        readBridgeCoreContract<
          readonly [`0x${string}`, number, bigint, `0x${string}`]
        >(config, bridgeCoreAddress, bridgeCoreAbi, {
          functionName: "getChannelInfo",
          args: [channelIdBytes32],
        }),
        readBridgeCoreContract<readonly `0x${string}`[]>(
          config,
          bridgeCoreAddress,
          bridgeCoreAbi,
          {
            functionName: "getChannelParticipants",
            args: [channelIdBytes32],
          }
        ),
        readBridgeCoreContract<bigint>(
          config,
          bridgeCoreAddress,
          bridgeCoreAbi,
          {
            functionName: "getChannelPreAllocatedLeavesCount",
            args: [channelIdBytes32],
          }
        ),
      ]);

      const [targetContract, state, participantCount, initialRoot] =
        channelInfo;

      const preAllocCount = channelPreAllocCount ? Number(channelPreAllocCount) : 0;

      console.log("[usePreviousStateSnapshot] Channel info from on-chain:", {
        targetContract,
        state,
        participantCount: Number(participantCount),
        initialRoot,
        preAllocCount,
        participants: participants?.map(p => p),
      });

      // Get pre-allocated keys using common contract hook
      const preAllocatedKeys = await readBridgeCoreContract<
        readonly `0x${string}`[]
      >(config, bridgeCoreAddress, bridgeCoreAbi, {
        functionName: "getPreAllocatedKeys",
        args: [targetContract],
      });

      console.log("[usePreviousStateSnapshot] Pre-allocated keys for target contract:", {
        targetContract,
        preAllocatedKeysCount: preAllocatedKeys?.length ?? 0,
        preAllocatedKeys: preAllocatedKeys?.map(k => k),
      });

      const preAllocatedLeaves: Array<{ key: string; value: string }> = [];

      // IMPORTANT: Must check preAllocCount (per-channel) NOT preAllocatedKeys.length (per-target-contract)
      // A channel with preAllocCount=0 should NOT include pre-allocated leaves even if the
      // target contract has pre-allocated keys registered globally
      if (preAllocCount > 0 && preAllocatedKeys && preAllocatedKeys.length > 0) {
        const preAllocatedLeafResults = await Promise.all(
          preAllocatedKeys.map((key) =>
            readBridgeCoreContract<readonly [bigint, boolean]>(
              config,
              bridgeCoreAddress,
              bridgeCoreAbi,
              {
                functionName: "getPreAllocatedLeaf",
                args: [targetContract, key],
              }
            )
          )
        );

        preAllocatedKeys.forEach((key, index) => {
          let keyHex: string;
          const keyValue = key as `0x${string}` | bigint | string;
          if (typeof keyValue === "string") {
            keyHex = keyValue.startsWith("0x") ? keyValue : `0x${keyValue}`;
            if (keyHex.length < 66) {
              const hexPart = keyHex.slice(2);
              keyHex = `0x${hexPart.padStart(64, "0")}`;
            }
          } else if (typeof keyValue === "bigint") {
            keyHex = `0x${keyValue.toString(16).padStart(64, "0")}`;
          } else {
            keyHex = `0x${String(keyValue).padStart(64, "0")}`;
          }

          const result = preAllocatedLeafResults[index] as
            | readonly [bigint, boolean]
            | undefined;
          if (result) {
            const [value, exists] = result;
            if (exists) {
              const valueHex = `0x${value.toString(16).padStart(64, "0")}`;
              preAllocatedLeaves.push({ key: keyHex, value: valueHex });
            }
          }
        });
      } else if (preAllocCount > 0) {
        // WORKAROUND: preAllocCount > 0 but getPreAllocatedKeys() returned empty for some contracts (e.g., USDT)
        // Use getTargetContractData() as fallback until contract is upgraded
        console.warn("[usePreviousStateSnapshot] getPreAllocatedKeys() returned empty, trying getTargetContractData() fallback");

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

        const targetContractData = await readBridgeCoreContract<TargetContractData>(
          config,
          bridgeCoreAddress,
          bridgeCoreAbi,
          {
            functionName: "getTargetContractData",
            args: [targetContract],
          }
        );

        if (targetContractData?.preAllocatedLeaves && targetContractData.preAllocatedLeaves.length > 0) {
          console.log("[usePreviousStateSnapshot] Found preAllocatedLeaves from getTargetContractData():",
            targetContractData.preAllocatedLeaves.length);

          targetContractData.preAllocatedLeaves.forEach((leaf) => {
            if (leaf.isActive) {
              let keyHex: string;
              if (typeof leaf.key === "string") {
                keyHex = leaf.key.startsWith("0x") ? leaf.key : `0x${leaf.key}`;
                if (keyHex.length < 66) {
                  keyHex = `0x${keyHex.slice(2).padStart(64, "0")}`;
                }
              } else {
                keyHex = `0x${String(leaf.key).padStart(64, "0")}`;
              }

              const valueHex = `0x${leaf.value.toString(16).padStart(64, "0")}`;
              preAllocatedLeaves.push({ key: keyHex, value: valueHex });
            }
          });

          console.log("[usePreviousStateSnapshot] Extracted active preAllocatedLeaves:", preAllocatedLeaves.length);
        }
      } else {
        console.log("[usePreviousStateSnapshot] preAllocCount=0, skipping pre-allocated leaves (not included in this channel)");
      }

      if (preAllocCount > 0 && (!preAllocatedLeaves || preAllocatedLeaves.length === 0)) {
        const errorMessage = `Pre-allocated leaves are missing or empty for target contract ${targetContract} (channel expects ${preAllocCount} pre-allocated leaves). Proof generation cannot proceed without pre-allocated leaves.`;
        console.error("[usePreviousStateSnapshot]", errorMessage);
        setError(errorMessage);
        setIsLoading(false);
        throw new Error(errorMessage);
      }

      // If we have an API snapshot but it was missing preAllocatedLeaves, merge them
      if (apiSnapshot) {
        const mergedSnapshot: StateSnapshot = {
          ...apiSnapshot,
          preAllocatedLeaves: preAllocatedLeaves.length > 0 ? [preAllocatedLeaves] : [[]],
        };
        console.log(
          `[usePreviousStateSnapshot] Merged preAllocatedLeaves (${preAllocatedLeaves.length} entries) into API snapshot`
        );
        console.log("[usePreviousStateSnapshot] Merged snapshot storageEntries:", mergedSnapshot.storageEntries?.[0]);
        setPreviousStateSnapshot(mergedSnapshot);
        setIsLoading(false);
        return mergedSnapshot;
      }

      // Otherwise, fetch everything from on-chain (first transfer simulation)
      console.log("[usePreviousStateSnapshot] No API snapshot available, building from on-chain data (initial state)");
      const registeredKeys: string[] = [];

      // DO NOT sort: must match the order returned by getPreAllocatedKeys() on-chain,
      // which is the order the contract's initializeChannelState iterates
      console.log("[usePreviousStateSnapshot] Using preAllocatedLeaves in original order:", preAllocatedLeaves.map(l => l.key));

      // Add pre-allocated keys to registeredKeys
      preAllocatedLeaves.forEach((leaf) => {
        registeredKeys.push(leaf.key);
      });

      // Get user storage slots from target contract (need full slot info for isLoadedOnChain)
      type UserStorageSlotInfo = {
        slotOffset: number;
        getterFunctionSignature: `0x${string}`;
        isLoadedOnChain: boolean;
      };
      let userStorageSlots: UserStorageSlotInfo[] = [{ slotOffset: 0, getterFunctionSignature: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`, isLoadedOnChain: false }];
      try {
        const targetContractData = await readBridgeCoreContract<{
          userStorageSlots: UserStorageSlotInfo[];
        }>(config, bridgeCoreAddress, bridgeCoreAbi, {
          functionName: "getTargetContractData",
          args: [targetContract],
        });
        if (targetContractData?.userStorageSlots?.length > 0) {
          userStorageSlots = targetContractData.userStorageSlots;
        }
        console.log(`[usePreviousStateSnapshot] Target contract has ${userStorageSlots.length} user storage slots:`,
          userStorageSlots.map((s, i) => `[${i}] offset=${s.slotOffset} onChain=${s.isLoadedOnChain}`));
      } catch (slotError) {
        console.warn("[usePreviousStateSnapshot] Failed to get target contract data, defaulting to 1 slot:", slotError);
      }
      const numSlots = userStorageSlots.length;

      // Fetch participants' MPT keys and slot values using common contract hook
      // For multi-token support, we now iterate through all slots for each participant
      const storageEntries: Array<{ key: string; value: string }> = [];

      if (participants.length > 0) {
        // Build array of all (participant, slotIndex) combinations
        // IMPORTANT: Loop order must be slot → participant to match useGenerateInitialProof
        // and the contract's initializeChannelState iteration order
        const participantSlotCombinations: Array<{ participant: `0x${string}`; slotIndex: number }> = [];
        for (let slotIndex = 0; slotIndex < numSlots; slotIndex++) {
          for (const participant of participants) {
            participantSlotCombinations.push({ participant, slotIndex });
          }
        }

        // Fetch all MPT keys in parallel
        const mptKeyResults = await Promise.all(
          participantSlotCombinations.map(({ participant, slotIndex }) =>
            readBridgeCoreContract<bigint>(
              config,
              bridgeCoreAddress,
              bridgeCoreAbi,
              {
                functionName: "getL2MptKey",
                args: [channelIdBytes32, participant, slotIndex],
              }
            )
          )
        );

        // Fetch slot values: use getValidatedUserSlotValue for deposit slots,
        // call target contract getter for on-chain slots (matches contract logic)
        const { call } = await import("@wagmi/core");
        const slotValueResults = await Promise.all(
          participantSlotCombinations.map(async ({ participant, slotIndex }) => {
            const slot = userStorageSlots[slotIndex];
            if (slot.isLoadedOnChain) {
              // On-chain slot: call target contract's getter function
              // Must exactly match contract's encoding: abi.encodePacked(bytes32, abi.encode(address))
              const sigWithout0x = slot.getterFunctionSignature.slice(2); // 64 hex chars (32 bytes)
              const encodedAddr = participant.slice(2).padStart(64, "0"); // 64 hex chars (32 bytes)
              try {
                const callResult = await call(config as any, {
                  to: targetContract as `0x${string}`,
                  data: `0x${sigWithout0x}${encodedAddr}` as `0x${string}`,
                });
                if (callResult.data && callResult.data.length >= 66) {
                  return BigInt(callResult.data);
                }
                return BigInt(0);
              } catch {
                console.warn(`[usePreviousStateSnapshot] On-chain getter call failed for ${participant} slot ${slotIndex}`);
                return BigInt(0);
              }
            } else {
              // Deposit slot: use getValidatedUserSlotValue
              return readBridgeCoreContract<bigint>(
                config,
                bridgeCoreAddress,
                bridgeCoreAbi,
                {
                  functionName: "getValidatedUserSlotValue",
                  args: [channelIdBytes32, participant, slotIndex],
                }
              );
            }
          })
        );

        participantSlotCombinations.forEach(({ participant, slotIndex }, index) => {
          const mptKey = mptKeyResults[index] as bigint;
          const slotValue = slotValueResults[index] as bigint;

          // Include in storageEntries if mptKey is non-zero (even if slotValue is zero)
          // Previously used `if (mptKey && deposit)` condition, but BigInt(0) is falsy,
          // causing participants with zero amount deposits to be excluded
          if (mptKey !== undefined && mptKey !== null && mptKey !== BigInt(0)) {
            const mptKeyHex = `0x${mptKey.toString(16).padStart(64, "0")}`;
            const slotValueHex = `0x${slotValue.toString(16).padStart(64, "0")}`;

            registeredKeys.push(mptKeyHex);
            storageEntries.push({ key: mptKeyHex, value: slotValueHex });
          }
        });
      }

      // StateSnapshot type expects channelId as number, but we're using bytes32 strings now
      // Pass the actual channelId string - tokamak-cli accepts string channelIds in JSON
      const snapshot: StateSnapshot = {
        channelId: channelIdBytes32 as unknown as number,
        stateRoots: [initialRoot],
        storageAddresses: [targetContract],
        registeredKeys: [registeredKeys],
        storageEntries: [storageEntries],
        entryContractAddress: targetContract,
        preAllocatedLeaves: [preAllocatedLeaves],
      };

      setPreviousStateSnapshot(snapshot);
      setIsLoading(false);
      return snapshot;
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to fetch previous state snapshot";
      setError(errorMessage);
      setIsLoading(false);
      throw new Error(
        `Could not find previous state snapshot and failed to fetch initial state from on-chain: ${errorMessage}`
      );
    }
  }, [channelId, bundleSnapshot, config, bridgeCoreAddress, bridgeCoreAbi]);

  return {
    previousStateSnapshot,
    isLoading,
    error,
    fetchSnapshot,
  };
}
