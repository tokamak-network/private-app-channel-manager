#!/usr/bin/env node

/**
 * Test script for usePreviousStateSnapshot hook logic
 *
 * Tests fetching initial channel state from on-chain data for channel ID 10.
 * This script extracts the core logic from the hook and tests it in Node.js.
 *
 * Run with: npx tsx test/hooks/usePreviousStateSnapshot.test.ts
 * Or: node --loader ts-node/esm test/hooks/usePreviousStateSnapshot.test.ts
 */

import { createConfig, http, readContracts } from "@wagmi/core";
import { sepolia } from "wagmi/chains";
import { addHexPrefix } from "@ethereumjs/util";
import type { StateSnapshot } from "tokamak-l2js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
// Use the same utilities that hooks use
import {
  getContractAddress,
  getContractAbi,
  getNetworkIdByChainId,
  DEFAULT_NETWORK,
} from "@tokamak/config";

// Load .env file from test directory
function loadEnv() {
  try {
    // Get the directory of this file
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFile);
    // Go up one level to test directory, then read .env
    const envPath = join(currentDir, "..", ".env");
    const envContent = readFileSync(envPath, "utf-8");
    const env: Record<string, string> = {};

    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts
            .join("=")
            .trim()
            .replace(/^["']|["']$/g, "");
          env[key.trim()] = value;
        }
      }
    });

    console.log(`📂 Loaded .env from: ${envPath}`);
    return env;
  } catch (error) {
    console.warn(
      `⚠️  Failed to load test/.env file: ${
        error instanceof Error ? error.message : error
      }`
    );
    console.warn("   Using environment variables or defaults");
    return {};
  }
}

const env = loadEnv();
const CHANNEL_ID = "10";
const RPC_URL =
  env.RPC_URL ||
  process.env.RPC_URL ||
  (process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
    ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    : "https://rpc.sepolia.org");

async function testFetchChannelInitialState() {
  console.log("🧪 Testing usePreviousStateSnapshot hook logic\n");
  console.log("=".repeat(60));
  console.log(`Channel ID: ${CHANNEL_ID}`);
  console.log(`RPC URL: ${RPC_URL}\n`);

  try {
    // Create wagmi config for Node.js environment
    const config = createConfig({
      chains: [sepolia],
      transports: {
        [sepolia.id]: http(RPC_URL),
      },
    });

    const chainId = sepolia.id;
    const channelIdNum = Number(addHexPrefix(CHANNEL_ID));

    // Use the same approach as hooks/contract/useBridgeCore.ts
    // useNetworkId hook logic: getNetworkIdByChainId(chainId) || DEFAULT_NETWORK
    const networkId = getNetworkIdByChainId(chainId) || DEFAULT_NETWORK;
    console.log(`Network ID: ${networkId} (from chain ID: ${chainId})\n`);

    // Use the same approach as useBridgeCoreAddress hook
    const bridgeCoreAddress = getContractAddress("BridgeCore", networkId);
    // Use the same approach as useBridgeCoreAbi hook
    const bridgeCoreAbi = getContractAbi("BridgeCore");

    console.log(`BridgeCore Address: ${bridgeCoreAddress}\n`);

    // Step 1: Get channel info and participants
    console.log("📡 Step 1: Fetching channel info and participants...");
    const [channelInfoResult, participantsResult] = await readContracts(
      config,
      {
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
      }
    );

    if (channelInfoResult?.status !== "success" || !channelInfoResult.result) {
      console.error(
        "Channel Info Result:",
        JSON.stringify(channelInfoResult, null, 2)
      );
      throw new Error(
        `Failed to fetch channel info: ${
          channelInfoResult?.error?.message || "Unknown error"
        }`
      );
    }

    if (
      participantsResult?.status !== "success" ||
      !participantsResult.result
    ) {
      console.error(
        "Participants Result:",
        JSON.stringify(participantsResult, null, 2)
      );
      throw new Error(
        `Failed to fetch channel participants: ${
          participantsResult?.error?.message || "Unknown error"
        }`
      );
    }

    const channelInfo = channelInfoResult.result as readonly [
      `0x${string}`,
      number,
      bigint,
      `0x${string}`
    ];
    const participants = participantsResult.result as readonly `0x${string}`[];

    const [targetContract, state, participantCount, initialRoot] = channelInfo;

    console.log(`   ✅ Channel Info:`);
    console.log(`      Target Contract: ${targetContract}`);
    console.log(`      State: ${state}`);
    console.log(`      Participant Count: ${participantCount}`);
    console.log(`      Initial Root: ${initialRoot}`);
    console.log(`   ✅ Participants: ${participants.length}`);
    participants.forEach((p, i) => {
      console.log(`      [${i}] ${p}`);
    });
    console.log("");

    // Step 2: Get pre-allocated keys
    console.log("📡 Step 2: Fetching pre-allocated keys...");
    const preAllocatedKeysResult = await readContracts(config, {
      contracts: [
        {
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getPreAllocatedKeys",
          args: [targetContract],
        },
      ],
    });

    const preAllocatedKeys = preAllocatedKeysResult?.[0]?.result as
      | readonly `0x${string}`[]
      | undefined;

    console.log(`   ✅ Pre-allocated Keys: ${preAllocatedKeys?.length || 0}\n`);

    const registeredKeys: string[] = [];
    const preAllocatedLeaves: Array<{ key: string; value: string }> = [];

    // Step 3: Fetch pre-allocated leaves
    if (preAllocatedKeys && preAllocatedKeys.length > 0) {
      console.log(
        `📡 Step 3: Fetching ${preAllocatedKeys.length} pre-allocated leaves...`
      );
      const preAllocatedLeafResults = await readContracts(config, {
        contracts: preAllocatedKeys.map((key) => ({
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getPreAllocatedLeaf",
          args: [targetContract, key],
        })),
      });

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

        registeredKeys.push(keyHex);

        const result = preAllocatedLeafResults[index];
        if (result?.status === "success" && result.result) {
          const resultValue = result.result as readonly [bigint, boolean];
          const [value, exists] = resultValue;
          if (exists) {
            const valueHex = `0x${value.toString(16).padStart(64, "0")}`;
            preAllocatedLeaves.push({ key: keyHex, value: valueHex });
          }
        }
      });
      console.log(`   ✅ Pre-allocated Leaves: ${preAllocatedLeaves.length}\n`);
    }

    // Step 4: Fetch participants' MPT keys and deposits
    const storageEntries: Array<{ key: string; value: string }> = [];

    if (participants.length > 0) {
      console.log(
        `📡 Step 4: Fetching MPT keys and deposits for ${participants.length} participants...`
      );

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
        console.log(`   Balance slot index: ${balanceSlotIndex}`);
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
            const mptKeyHex = `0x${mptKey.toString(16).padStart(64, "0")}`;
            const depositHex = `0x${deposit.toString(16).padStart(64, "0")}`;

            registeredKeys.push(mptKeyHex);
            storageEntries.push({ key: mptKeyHex, value: depositHex });

            console.log(`   ✅ Participant ${index + 1}:`);
            console.log(`      Address: ${participant}`);
            console.log(`      MPT Key: ${mptKeyHex}`);
            console.log(`      Deposit: ${depositHex}`);
          }
        }
      });
      console.log("");
    }

    // Build snapshot
    const snapshot: StateSnapshot = {
      channelId: channelIdNum,
      stateRoot: initialRoot,
      registeredKeys,
      storageEntries,
      contractAddress: targetContract,
      preAllocatedLeaves,
    };

    // Display results
    console.log("=".repeat(60));
    console.log("📊 Snapshot Summary:\n");
    console.log(`   Channel ID: ${snapshot.channelId}`);
    console.log(`   State Root: ${snapshot.stateRoot}`);
    console.log(`   Contract Address: ${snapshot.contractAddress}`);
    console.log(`   Registered Keys: ${snapshot.registeredKeys.length}`);
    console.log(`   Storage Entries: ${snapshot.storageEntries.length}`);
    console.log(
      `   Pre-allocated Leaves: ${snapshot.preAllocatedLeaves.length}`
    );

    // Validation
    console.log("\n" + "=".repeat(60));
    console.log("✅ Validation:\n");

    if (
      snapshot.stateRoot ===
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      console.log("   ⚠️  WARNING: State root is all zeros!");
      console.log(
        "      This might indicate the channel hasn't been initialized yet."
      );
    } else {
      console.log("   ✅ State root is valid (not all zeros)");
    }

    if (snapshot.registeredKeys.length === 0) {
      console.log("   ⚠️  WARNING: No registered keys found!");
    } else {
      console.log(
        `   ✅ Found ${snapshot.registeredKeys.length} registered keys`
      );
    }

    if (snapshot.storageEntries.length === 0) {
      console.log("   ⚠️  WARNING: No storage entries found!");
      console.log("      This might indicate no deposits have been made.");
    } else {
      console.log(
        `   ✅ Found ${snapshot.storageEntries.length} storage entries`
      );
    }

    if (
      snapshot.contractAddress === "0x0000000000000000000000000000000000000000"
    ) {
      console.log("   ⚠️  WARNING: Contract address is zero!");
    } else {
      console.log("   ✅ Contract address is valid");
    }

    // Output full snapshot JSON
    console.log("\n" + "=".repeat(60));
    console.log("📄 Full Snapshot JSON:\n");
    console.log(JSON.stringify(snapshot, null, 2));

    console.log("\n" + "=".repeat(60));
    console.log("✅ Test completed successfully!\n");

    return snapshot;
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ Test failed!\n");
    console.error("Error:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testFetchChannelInitialState()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
