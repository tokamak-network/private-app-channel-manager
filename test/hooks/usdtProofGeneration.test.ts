#!/usr/bin/env node

/**
 * USDT Proof Generation Test
 *
 * Tests proof generation for USDT token transfers on a multi-token channel.
 * Run with: npx tsx test/hooks/usdtProofGeneration.test.ts
 */

import { createConfig, http, readContracts } from "@wagmi/core";
import { sepolia } from "wagmi/chains";
import { mnemonicToAccount, HDAccount } from "viem/accounts";
import { createWalletClient, http as viemHttp, keccak256, toHex } from "viem";
import type { StateSnapshot } from "tokamak-l2js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getContractAddress,
  getContractAbi,
  getNetworkIdByChainId,
  DEFAULT_NETWORK,
  SUPPORTED_TOKENS,
  ERC20_TRANSFER,
} from "@tokamak/config";
import { deriveL2KeysAndAddressFromSignature } from "../../lib/tokamakl2js";

// Test configuration
const SEED_PHRASE = "danger river dirt feel magic vibrant either cradle kiss distance nose produce";
const CHANNEL_ID = "0x2baa6ee8cc157612cd8584970eac6ef03d30f87ed2ac5c4d02b32da620c45c4b";
const RECIPIENT_L2_ADDRESS = "0xcf9a76255b3b4cd930eeda5972273c7f66c6808e";
const TRANSFER_AMOUNT = 1n * 10n ** 6n; // 1 USDT (6 decimals)
const USDT_ADDRESS = SUPPORTED_TOKENS.USDT.address;

function loadEnv() {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFile);
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
    console.warn(`⚠️  Failed to load test/.env file`);
    return {};
  }
}

const env = loadEnv();
const RPC_URL =
  env.RPC_URL ||
  process.env.RPC_URL ||
  (process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
    ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    : "https://rpc.sepolia.org");

async function generateKeySeed(account: HDAccount, chainId: number): Promise<`0x${string}`> {
  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: viemHttp(RPC_URL),
  });

  const message = "Sign this message to generate your L2 key";
  const signature = await client.signMessage({ message });
  
  return signature;
}

async function testUsdtProofGeneration() {
  console.log("🧪 Testing USDT Proof Generation\n");
  console.log("=".repeat(70));
  console.log(`Channel ID: ${CHANNEL_ID}`);
  console.log(`USDT Address: ${USDT_ADDRESS}`);
  console.log(`Recipient L2: ${RECIPIENT_L2_ADDRESS}`);
  console.log(`Amount: ${TRANSFER_AMOUNT} (1 USDT)`);
  console.log(`RPC URL: ${RPC_URL}\n`);

  try {
    // Step 1: Setup
    console.log("📡 Step 1: Setting up wallet and config...");
    const account = mnemonicToAccount(SEED_PHRASE);
    console.log(`   Wallet Address: ${account.address}`);

    const config = createConfig({
      chains: [sepolia],
      transports: {
        [sepolia.id]: http(RPC_URL),
      },
    });

    const chainId = sepolia.id;
    const networkId = getNetworkIdByChainId(chainId) || DEFAULT_NETWORK;
    const bridgeCoreAddress = getContractAddress("BridgeCore", networkId);
    const bridgeCoreAbi = getContractAbi("BridgeCore");

    console.log(`   Network ID: ${networkId}`);
    console.log(`   BridgeCore: ${bridgeCoreAddress}\n`);

    // Step 2: Get channel info
    console.log("📡 Step 2: Fetching channel info...");
    const channelIdBytes32 = CHANNEL_ID as `0x${string}`;

    const [channelInfoResult, participantsResult] = await readContracts(config, {
      contracts: [
        {
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getChannelInfo",
          args: [channelIdBytes32],
        },
        {
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getChannelParticipants",
          args: [channelIdBytes32],
        },
      ],
    });

    if (channelInfoResult?.status !== "success" || !channelInfoResult.result) {
      throw new Error(`Failed to fetch channel info: ${JSON.stringify(channelInfoResult)}`);
    }

    const channelInfo = channelInfoResult.result as readonly [
      `0x${string}`,
      number,
      bigint,
      `0x${string}`
    ];
    const participants = participantsResult?.result as readonly `0x${string}`[] || [];

    const [targetContract, state, participantCount, initialRoot] = channelInfo;

    console.log(`   Target Contract: ${targetContract}`);
    console.log(`   Channel State: ${state}`);
    console.log(`   Participant Count: ${participantCount}`);
    console.log(`   Initial Root: ${initialRoot}`);
    console.log(`   Participants: ${participants.length}`);
    participants.forEach((p, i) => console.log(`      [${i}] ${p}`));
    console.log("");

    // Step 3: Get pre-allocated keys using getTargetContractData (workaround)
    console.log("📡 Step 3: Fetching target contract data (workaround for missing getPreAllocatedKeys)...");
    console.log(`   Target Contract (from channel): ${targetContract}`);

    const targetContractDataResult = await readContracts(config, {
      contracts: [
        {
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getTargetContractData",
          args: [targetContract],
        },
      ],
    });

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

    const targetContractData = targetContractDataResult?.[0]?.result as TargetContractData | undefined;

    console.log(`   Target Contract Data Result:`, targetContractDataResult?.[0]?.status);
    
    let preAllocatedKeys: `0x${string}`[] = [];
    
    if (targetContractData) {
      console.log(`   Pre-allocated Leaves from getTargetContractData: ${targetContractData.preAllocatedLeaves?.length || 0}`);
      console.log(`   Registered Functions: ${targetContractData.registeredFunctions?.length || 0}`);
      console.log(`   User Storage Slots: ${targetContractData.userStorageSlots?.length || 0}`);
      
      if (targetContractData.preAllocatedLeaves && targetContractData.preAllocatedLeaves.length > 0) {
        console.log(`   Pre-allocated Leaves Details:`);
        targetContractData.preAllocatedLeaves.forEach((leaf, i) => {
          console.log(`      [${i}] key: ${leaf.key}, value: ${leaf.value}, isActive: ${leaf.isActive}`);
        });
        
        preAllocatedKeys = targetContractData.preAllocatedLeaves
          .filter(leaf => leaf.isActive)
          .map(leaf => leaf.key);
      }
    } else {
      console.log(`   ⚠️  WARNING: getTargetContractData returned no data`);
    }

    // Also check getPreAllocatedKeys for comparison
    console.log(`\n   Comparing with getPreAllocatedKeys()...`);
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

    const preAllocatedKeysFromDirect = preAllocatedKeysResult?.[0]?.result as
      | readonly `0x${string}`[]
      | undefined;

    console.log(`   getPreAllocatedKeys() result: ${preAllocatedKeysFromDirect?.length || 0} keys`);
    console.log("");

    // Step 4: Build pre-allocated leaves from getTargetContractData (workaround)
    const registeredKeys: string[] = [];
    const preAllocatedLeaves: Array<{ key: string; value: string }> = [];

    if (targetContractData?.preAllocatedLeaves && targetContractData.preAllocatedLeaves.length > 0) {
      console.log("📡 Step 4: Building pre-allocated leaves from getTargetContractData()...");
      
      targetContractData.preAllocatedLeaves.forEach((leaf, i) => {
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
          
          registeredKeys.push(keyHex);
          preAllocatedLeaves.push({ key: keyHex, value: valueHex });
          
          console.log(`   [${i}] key: ${keyHex}, value: ${valueHex}`);
        }
      });
      
      console.log(`   ✅ Pre-allocated Leaves: ${preAllocatedLeaves.length}\n`);
    } else {
      console.log("⚠️  Step 4 Skipped: No pre-allocated leaves found\n");
    }

    // Step 5: Generate key seed and derive L2 account
    console.log("📡 Step 5: Generating L2 account...");
    const keySeed = await generateKeySeed(account, chainId);
    console.log(`   Key Seed (signature): ${keySeed.slice(0, 20)}...`);
    
    const usdtSlot = ERC20_TRANSFER[USDT_ADDRESS]?.slot;
    console.log(`   USDT Slot Index: ${usdtSlot}`);
    
    if (usdtSlot === undefined) {
      throw new Error(`USDT slot not found in ERC20_TRANSFER config`);
    }
    
    const l2Account = deriveL2KeysAndAddressFromSignature(keySeed, usdtSlot);
    console.log(`   L2 Address: ${l2Account.l2Address}`);
    console.log(`   L2 MPT Key: ${l2Account.mptKey}`);
    console.log(`   L2 Public Key: ${l2Account.publicKey.slice(0, 20)}...\n`);

    // Step 6: Fetch participant storage entries with multi-slot support
    console.log("📡 Step 6: Fetching participant storage entries (multi-slot)...");
    const storageEntries: Array<{ key: string; value: string }> = [];

    // Get number of user storage slots
    let numSlots = 1;
    try {
      const targetContractDataResult = await readContracts(config, {
        contracts: [
          {
            address: bridgeCoreAddress,
            abi: bridgeCoreAbi,
            functionName: "getTargetContractData",
            args: [targetContract],
          },
        ],
      });
      
      if (targetContractDataResult?.[0]?.status === "success" && targetContractDataResult[0].result) {
        const data = targetContractDataResult[0].result as { userStorageSlots: unknown[] };
        numSlots = data?.userStorageSlots?.length || 1;
      }
    } catch (e) {
      console.log(`   Failed to get target contract data, defaulting to 1 slot`);
    }
    console.log(`   Number of slots: ${numSlots}`);

    if (participants.length > 0) {
      const participantSlotCombinations: Array<{ participant: `0x${string}`; slotIndex: number }> = [];
      for (const participant of participants) {
        for (let slotIndex = 0; slotIndex < numSlots; slotIndex++) {
          participantSlotCombinations.push({ participant, slotIndex });
        }
      }

      const participantDataResults = await readContracts(config, {
        contracts: participantSlotCombinations.flatMap(({ participant, slotIndex }) => [
          {
            address: bridgeCoreAddress,
            abi: bridgeCoreAbi,
            functionName: "getL2MptKey",
            args: [channelIdBytes32, participant, slotIndex],
          },
          {
            address: bridgeCoreAddress,
            abi: bridgeCoreAbi,
            functionName: "getValidatedUserSlotValue",
            args: [channelIdBytes32, participant, slotIndex],
          },
        ]),
      });

      participantSlotCombinations.forEach(({ participant, slotIndex }, index) => {
        const mptKeyResult = participantDataResults[index * 2];
        const slotValueResult = participantDataResults[index * 2 + 1];

        if (
          mptKeyResult?.status === "success" &&
          mptKeyResult.result !== undefined &&
          slotValueResult?.status === "success" &&
          slotValueResult.result !== undefined
        ) {
          const mptKey = mptKeyResult.result as bigint;
          const slotValue = slotValueResult.result as bigint;

          if (mptKey !== BigInt(0)) {
            const mptKeyHex = `0x${mptKey.toString(16).padStart(64, "0")}`;
            const slotValueHex = `0x${slotValue.toString(16).padStart(64, "0")}`;

            registeredKeys.push(mptKeyHex);
            storageEntries.push({ key: mptKeyHex, value: slotValueHex });

            console.log(`   Participant ${participant.slice(0, 10)}... slot[${slotIndex}]:`);
            console.log(`      MPT Key: ${mptKeyHex.slice(0, 20)}...`);
            console.log(`      Value: ${slotValueHex}`);
          }
        }
      });
    }
    console.log(`   ✅ Storage Entries: ${storageEntries.length}\n`);

    // Step 7: Build snapshot
    console.log("📡 Step 7: Building state snapshot...");
    const snapshot: StateSnapshot = {
      channelId: channelIdBytes32 as unknown as number,
      stateRoot: initialRoot,
      registeredKeys,
      storageEntries,
      contractAddress: targetContract,
      preAllocatedLeaves,
    };

    console.log(`   Channel ID: ${channelIdBytes32}`);
    console.log(`   State Root: ${snapshot.stateRoot}`);
    console.log(`   Contract Address: ${snapshot.contractAddress}`);
    console.log(`   Registered Keys: ${snapshot.registeredKeys.length}`);
    console.log(`   Storage Entries: ${snapshot.storageEntries.length}`);
    console.log(`   Pre-allocated Leaves: ${snapshot.preAllocatedLeaves.length}\n`);

    // Validation
    console.log("=".repeat(70));
    console.log("✅ Validation Summary:\n");

    const issues: string[] = [];

    if (!preAllocatedKeys || preAllocatedKeys.length === 0) {
      issues.push("❌ CRITICAL: No pre-allocated keys found for target contract");
      issues.push(`   Target Contract: ${targetContract}`);
      issues.push(`   This is the root cause of proof generation failure.`);
      issues.push(`   The USDT contract needs pre-allocated keys registered on-chain.`);
    } else {
      console.log(`✅ Pre-allocated keys found: ${preAllocatedKeys.length}`);
    }

    if (preAllocatedLeaves.length === 0 && preAllocatedKeys && preAllocatedKeys.length > 0) {
      issues.push("⚠️  WARNING: Pre-allocated keys exist but no leaves found");
    } else if (preAllocatedLeaves.length > 0) {
      console.log(`✅ Pre-allocated leaves found: ${preAllocatedLeaves.length}`);
    }

    if (storageEntries.length === 0) {
      issues.push("⚠️  WARNING: No storage entries found (no deposits?)");
    } else {
      console.log(`✅ Storage entries found: ${storageEntries.length}`);
    }

    if (targetContract.toLowerCase() !== USDT_ADDRESS.toLowerCase()) {
      issues.push(`⚠️  WARNING: Target contract mismatch`);
      issues.push(`   Channel target: ${targetContract}`);
      issues.push(`   Expected USDT: ${USDT_ADDRESS}`);
    } else {
      console.log(`✅ Target contract matches USDT address`);
    }

    if (issues.length > 0) {
      console.log("\n" + "=".repeat(70));
      console.log("❌ Issues Found:\n");
      issues.forEach(issue => console.log(issue));
    }

    console.log("\n" + "=".repeat(70));
    console.log("📄 Full Snapshot JSON:\n");
    console.log(JSON.stringify(snapshot, null, 2));

    console.log("\n" + "=".repeat(70));
    if (issues.some(i => i.includes("CRITICAL"))) {
      console.log("❌ Test completed with CRITICAL issues\n");
      process.exit(1);
    } else {
      console.log("✅ Test completed!\n");
    }

    return snapshot;
  } catch (error) {
    console.error("\n" + "=".repeat(70));
    console.error("❌ Test failed!\n");
    console.error("Error:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testUsdtProofGeneration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
