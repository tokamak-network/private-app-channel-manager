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
            apiSnapshot = data.snapshot;
            console.log("[usePreviousStateSnapshot] API snapshot details:", {
              stateRoot: apiSnapshot?.stateRoot,
              storageEntriesCount: apiSnapshot?.storageEntries?.length,
              storageEntries: apiSnapshot?.storageEntries,
              hasPreAllocatedLeaves: !!(apiSnapshot?.preAllocatedLeaves?.length),
            });
            
            // Check if preAllocatedLeaves is missing or empty
            if (apiSnapshot) {
              const hasPreAllocatedLeaves =
                apiSnapshot.preAllocatedLeaves &&
                Array.isArray(apiSnapshot.preAllocatedLeaves) &&
                apiSnapshot.preAllocatedLeaves.length > 0;

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

      // Get channel info and participants using common contract hook
      const [channelInfo, participants] = await Promise.all([
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
      ]);

      const [targetContract, state, participantCount, initialRoot] =
        channelInfo;

      // Get pre-allocated keys using common contract hook
      const preAllocatedKeys = await readBridgeCoreContract<
        readonly `0x${string}`[]
      >(config, bridgeCoreAddress, bridgeCoreAbi, {
        functionName: "getPreAllocatedKeys",
        args: [targetContract],
      });

      const preAllocatedLeaves: Array<{ key: string; value: string }> = [];

      // Fetch pre-allocated leaves using common contract hook
      if (preAllocatedKeys && preAllocatedKeys.length > 0) {
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
      }

      // Validate preAllocatedLeaves - required for proof generation
      if (!preAllocatedKeys || preAllocatedKeys.length === 0) {
        const errorMessage = `Pre-allocated keys are missing or empty for target contract ${targetContract}. Proof generation cannot proceed without pre-allocated leaves.`;
        console.error("[usePreviousStateSnapshot]", errorMessage);
        setError(errorMessage);
        setIsLoading(false);
        throw new Error(errorMessage);
      }

      if (!preAllocatedLeaves || preAllocatedLeaves.length === 0) {
        const errorMessage = `Pre-allocated leaves are missing or empty for target contract ${targetContract}. Expected ${preAllocatedKeys.length} leaves but got 0. Proof generation cannot proceed without pre-allocated leaves.`;
        console.error("[usePreviousStateSnapshot]", errorMessage);
        setError(errorMessage);
        setIsLoading(false);
        throw new Error(errorMessage);
      }

      // If we have an API snapshot but it was missing preAllocatedLeaves, merge them
      if (apiSnapshot && preAllocatedLeaves.length > 0) {
        const mergedSnapshot: StateSnapshot = {
          ...apiSnapshot,
          preAllocatedLeaves,
        };
        console.log(
          `[usePreviousStateSnapshot] Merged preAllocatedLeaves (${preAllocatedLeaves.length} entries) into API snapshot`
        );
        console.log("[usePreviousStateSnapshot] Merged snapshot storageEntries:", mergedSnapshot.storageEntries);
        setPreviousStateSnapshot(mergedSnapshot);
        setIsLoading(false);
        return mergedSnapshot;
      }

      // Otherwise, fetch everything from on-chain (first transfer simulation)
      console.log("[usePreviousStateSnapshot] No API snapshot available, building from on-chain data (initial state)");
      const registeredKeys: string[] = [];

      // Add pre-allocated keys to registeredKeys
      preAllocatedLeaves.forEach((leaf) => {
        registeredKeys.push(leaf.key);
      });

      // Get number of user storage slots from target contract
      let numSlots = 1; // Default to 1 (balance only)
      try {
        const targetContractData = await readBridgeCoreContract<{
          userStorageSlots: unknown[];
        }>(config, bridgeCoreAddress, bridgeCoreAbi, {
          functionName: "getTargetContractData",
          args: [targetContract],
        });
        numSlots = targetContractData?.userStorageSlots?.length || 1;
        console.log(`[usePreviousStateSnapshot] Target contract has ${numSlots} user storage slots`);
      } catch (slotError) {
        console.warn("[usePreviousStateSnapshot] Failed to get target contract data, defaulting to 1 slot:", slotError);
      }

      // Fetch participants' MPT keys and slot values using common contract hook
      // For multi-token support, we now iterate through all slots for each participant
      const storageEntries: Array<{ key: string; value: string }> = [];

      if (participants.length > 0) {
        // Build array of all (participant, slotIndex) combinations
        const participantSlotCombinations: Array<{ participant: `0x${string}`; slotIndex: number }> = [];
        for (const participant of participants) {
          for (let slotIndex = 0; slotIndex < numSlots; slotIndex++) {
            participantSlotCombinations.push({ participant, slotIndex });
          }
        }

        // Fetch all MPT keys and slot values in parallel
        const participantDataResults = await Promise.all(
          participantSlotCombinations.flatMap(({ participant, slotIndex }) => [
            readBridgeCoreContract<bigint>(
              config,
              bridgeCoreAddress,
              bridgeCoreAbi,
              {
                functionName: "getL2MptKey",
                args: [channelIdBytes32, participant, slotIndex],
              }
            ),
            readBridgeCoreContract<bigint>(
              config,
              bridgeCoreAddress,
              bridgeCoreAbi,
              {
                functionName: "getValidatedUserSlotValue",
                args: [channelIdBytes32, participant, slotIndex],
              }
            ),
          ])
        );

        participantSlotCombinations.forEach(({ participant, slotIndex }, index) => {
          const mptKey = participantDataResults[index * 2] as bigint;
          const slotValue = participantDataResults[index * 2 + 1] as bigint;

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

      // StateSnapshot expects channelId as number, but we're using bytes32 now
      // For compatibility, we'll use 0 as a placeholder since channelId is bytes32
      // The actual channelId is tracked separately in the application
      const snapshot: StateSnapshot = {
        channelId: 0, // Placeholder - channelId is now bytes32, not a number
        stateRoot: initialRoot,
        registeredKeys,
        storageEntries,
        contractAddress: targetContract,
        preAllocatedLeaves,
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
