/**
 * Fetch Initial Channel State from On-Chain
 * 
 * This function fetches the initial channel state from the blockchain
 * when no state snapshot exists in the database (first transfer simulation).
 * 
 * Based on the original repository's fetchChannelData function.
 */

import { readContracts } from "@wagmi/core";
import type { Config } from "wagmi";
import { getContractAddress, getContractAbi, getChainByChainId } from "@tokamak/config";
import { addHexPrefix } from "@ethereumjs/util";

export interface ChannelInitialState {
  channelId: number;
  stateRoot: string;
  registeredKeys: string[];
  storageEntries: Array<{ key: string; value: string }>;
  contractAddress: string;
  preAllocatedLeaves: Array<{ key: string; value: string }>;
}

/**
 * Fetch initial channel state from on-chain data
 * Used when no state snapshot exists in DB (first transfer simulation)
 */
export async function fetchChannelInitialState(
  channelId: string | number,
  chainId: number,
  config: Config
): Promise<ChannelInitialState> {
  const channelIdNum = typeof channelId === "string" 
    ? Number(addHexPrefix(channelId)) 
    : channelId;

  // Get RPC URL from chain config
  let rpcUrl: string;
  if (chainId) {
    const chain = getChainByChainId(chainId);
    if (!chain) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }
    rpcUrl = chain.rpcUrls.default.http[0];
  } else {
    // Use default (will be determined by wagmi config)
    throw new Error("chainId is required");
  }

  const bridgeCoreAddress = getContractAddress("BridgeCore", chainId);
  const bridgeCoreAbi = getContractAbi("BridgeCore");

  // Get channel info (includes initialRoot)
  const [channelInfoResult, participantsResult] = await readContracts(config, {
    contracts: [
      {
        address: bridgeCoreAddress,
        abi: bridgeCoreAbi,
        functionName: "getChannelInfo",
        args: [BigInt(channelIdNum)],
      },
      {
        address: bridgeCoreAddress,
        abi: bridgeCoreAbi,
        functionName: "getChannelParticipants",
        args: [BigInt(channelIdNum)],
      },
    ],
  });

  if (channelInfoResult?.status !== "success" || !channelInfoResult.result) {
    throw new Error("Failed to fetch channel info");
  }

  if (participantsResult?.status !== "success" || !participantsResult.result) {
    throw new Error("Failed to fetch channel participants");
  }

  const channelInfo = channelInfoResult.result as readonly [
    `0x${string}`,
    number,
    bigint,
    `0x${string}`
  ];
  const participants = participantsResult.result as readonly `0x${string}`[];

  const [targetContract, state, participantCount, initialRoot] = channelInfo;

  // Get pre-allocated keys and channel's pre-allocated count
  const [preAllocatedKeysResult, preAllocCountResult] = await readContracts(config, {
    contracts: [
      {
        address: bridgeCoreAddress,
        abi: bridgeCoreAbi,
        functionName: "getPreAllocatedKeys",
        args: [targetContract],
      },
      {
        address: bridgeCoreAddress,
        abi: bridgeCoreAbi,
        functionName: "getChannelPreAllocatedLeavesCount",
        args: [BigInt(channelIdNum)],
      },
    ],
  });

  const preAllocatedKeys = preAllocatedKeysResult?.result as
    | readonly `0x${string}`[]
    | undefined;

  const preAllocCount = preAllocCountResult?.status === "success"
    ? Number(preAllocCountResult.result)
    : 0;

  const registeredKeys: string[] = [];
  const preAllocatedLeaves: Array<{ key: string; value: string }> = [];

  // Fetch pre-allocated leaves
  // IMPORTANT: Must check preAllocCount (per-channel) NOT preAllocatedKeys.length (per-target-contract)
  // A channel with preAllocCount=0 should NOT include pre-allocated leaves even if the
  // target contract has pre-allocated keys registered globally
  if (preAllocCount > 0 && preAllocatedKeys && preAllocatedKeys.length > 0) {
    const preAllocatedLeafResults = await readContracts(config, {
      contracts: preAllocatedKeys.map((key) => ({
        address: bridgeCoreAddress,
        abi: bridgeCoreAbi,
        functionName: "getPreAllocatedLeaf",
        args: [targetContract, key],
      })),
    });

    preAllocatedKeys.forEach((key, index) => {
      const keyHex = addHexPrefix(key);
      registeredKeys.push(keyHex);

      const result = preAllocatedLeafResults[index];
      if (result?.status === "success" && result.result) {
        const [value, exists] = result.result as [bigint, boolean];
        if (exists) {
          const valueHex = addHexPrefix(value.toString(16).padStart(64, "0"));
          preAllocatedLeaves.push({ key: keyHex, value: valueHex });
        }
      }
    });
  }

  // Fetch participants' MPT keys and deposits
  const storageEntries: Array<{ key: string; value: string }> = [];

  if (participants.length > 0) {
    // Get balance slot index from target contract
    let balanceSlotIndex = 0;
    const slotIndexResult = await readContracts(config, {
      contracts: [
        {
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getBalanceSlotIndex",
          args: [targetContract],
        },
      ],
    });
    if (slotIndexResult[0]?.status === "success") {
      balanceSlotIndex = Number(slotIndexResult[0].result);
    }

    const participantDataResults = await readContracts(config, {
      contracts: participants.flatMap((participant) => [
        {
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getL2MptKey",
          args: [BigInt(channelIdNum), participant, balanceSlotIndex],
        },
        {
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getParticipantDeposit",
          args: [BigInt(channelIdNum), participant],
        },
      ]),
    });

    participants.forEach((participant, index) => {
      const mptKeyResult = participantDataResults[index * 2];
      const depositResult = participantDataResults[index * 2 + 1];

      // Include in storageEntries if mptKey is non-zero (even if deposit is zero)
      // Previously used truthy check on `depositResult.result`, but BigInt(0) is falsy,
      // causing participants with zero amount deposits to be excluded
      if (
        mptKeyResult?.status === "success" &&
        mptKeyResult.result !== undefined &&
        mptKeyResult.result !== null &&
        depositResult?.status === "success" &&
        depositResult.result !== undefined
      ) {
        const mptKey = mptKeyResult.result as bigint;
        const deposit = depositResult.result as bigint;

        // Only add if mptKey is non-zero (valid MPT key)
        if (mptKey !== BigInt(0)) {
          const mptKeyHex = addHexPrefix(mptKey.toString(16).padStart(64, "0"));
          const depositHex = addHexPrefix(deposit.toString(16).padStart(64, "0"));

          registeredKeys.push(mptKeyHex);
          storageEntries.push({ key: mptKeyHex, value: depositHex });
        }
      }
    });
  }

  return {
    channelId: channelIdNum,
    stateRoot: initialRoot,
    registeredKeys,
    storageEntries,
    contractAddress: targetContract,
    preAllocatedLeaves,
  };
}
