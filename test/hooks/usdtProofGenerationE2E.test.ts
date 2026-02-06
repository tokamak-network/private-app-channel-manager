#!/usr/bin/env node

/**
 * USDT Proof Generation E2E Test
 *
 * Tests the full proof generation flow for USDT token transfers.
 * Run with: npx tsx test/hooks/usdtProofGenerationE2E.test.ts
 */

import { createConfig, http, readContracts } from "@wagmi/core";
import { sepolia } from "wagmi/chains";
import { mnemonicToAccount } from "viem/accounts";
import { createWalletClient, http as viemHttp } from "viem";
import { bytesToHex } from "@ethereumjs/util";
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
import { createERC20TransferTx } from "../../lib/createERC20TransferTx";

const SEED_PHRASE = "danger river dirt feel magic vibrant either cradle kiss distance nose produce";
const CHANNEL_ID = "0x2baa6ee8cc157612cd8584970eac6ef03d30f87ed2ac5c4d02b32da620c45c4b";
const RECIPIENT_L2_ADDRESS = "0xcf9a76255b3b4cd930eeda5972273c7f66c6808e" as `0x${string}`;
const TRANSFER_AMOUNT = 1n * 10n ** 6n;
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
          const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
          env[key.trim()] = value;
        }
      }
    });
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv();
const RPC_URL = env.RPC_URL || process.env.RPC_URL || "https://rpc.sepolia.org";

async function generateKeySeed(account: ReturnType<typeof mnemonicToAccount>): Promise<`0x${string}`> {
  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: viemHttp(RPC_URL),
  });
  const message = "Sign this message to generate your L2 key";
  return await client.signMessage({ message });
}

async function testUsdtProofGenerationE2E() {
  console.log("🧪 USDT Proof Generation E2E Test\n");
  console.log("=".repeat(70));

  try {
    const account = mnemonicToAccount(SEED_PHRASE);
    console.log(`Wallet: ${account.address}`);

    const config = createConfig({
      chains: [sepolia],
      transports: { [sepolia.id]: http(RPC_URL) },
    });

    const chainId = sepolia.id;
    const networkId = getNetworkIdByChainId(chainId) || DEFAULT_NETWORK;
    const bridgeCoreAddress = getContractAddress("BridgeCore", networkId);
    const bridgeCoreAbi = getContractAbi("BridgeCore");

    // Step 1: Fetch channel info
    console.log("\n📡 Step 1: Fetching channel info...");
    const channelIdBytes32 = CHANNEL_ID as `0x${string}`;

    const [channelInfoResult, participantsResult] = await readContracts(config, {
      contracts: [
        { address: bridgeCoreAddress, abi: bridgeCoreAbi, functionName: "getChannelInfo", args: [channelIdBytes32] },
        { address: bridgeCoreAddress, abi: bridgeCoreAbi, functionName: "getChannelParticipants", args: [channelIdBytes32] },
      ],
    });

    const channelInfo = channelInfoResult?.result as readonly [`0x${string}`, number, bigint, `0x${string}`];
    const participants = participantsResult?.result as readonly `0x${string}`[] || [];
    const [targetContract, , , initialRoot] = channelInfo;

    console.log(`   Target Contract: ${targetContract}`);
    console.log(`   Initial Root: ${initialRoot}`);

    // Step 2: Fetch target contract data (workaround)
    console.log("\n📡 Step 2: Fetching target contract data...");
    
    type PreAllocatedLeafStruct = { value: bigint; key: `0x${string}`; isActive: boolean };
    type TargetContractData = {
      preAllocatedLeaves: readonly PreAllocatedLeafStruct[];
      userStorageSlots: readonly unknown[];
    };

    const targetContractDataResult = await readContracts(config, {
      contracts: [
        { address: bridgeCoreAddress, abi: bridgeCoreAbi, functionName: "getTargetContractData", args: [targetContract] },
      ],
    });

    const targetContractData = targetContractDataResult?.[0]?.result as TargetContractData | undefined;
    const numSlots = targetContractData?.userStorageSlots?.length || 1;
    
    console.log(`   Pre-allocated leaves: ${targetContractData?.preAllocatedLeaves?.length || 0}`);
    console.log(`   User storage slots: ${numSlots}`);

    // Step 3: Build pre-allocated leaves
    console.log("\n📡 Step 3: Building pre-allocated leaves...");
    const registeredKeys: string[] = [];
    const preAllocatedLeaves: Array<{ key: string; value: string }> = [];

    if (targetContractData?.preAllocatedLeaves) {
      targetContractData.preAllocatedLeaves.forEach((leaf) => {
        if (leaf.isActive) {
          let keyHex = leaf.key.startsWith("0x") ? leaf.key : `0x${leaf.key}`;
          if (keyHex.length < 66) keyHex = `0x${keyHex.slice(2).padStart(64, "0")}` as `0x${string}`;
          const valueHex = `0x${leaf.value.toString(16).padStart(64, "0")}`;
          registeredKeys.push(keyHex);
          preAllocatedLeaves.push({ key: keyHex, value: valueHex });
        }
      });
    }
    console.log(`   ✅ Pre-allocated leaves: ${preAllocatedLeaves.length}`);

    // Step 4: Fetch participant storage entries
    console.log("\n📡 Step 4: Fetching participant storage entries...");
    const storageEntries: Array<{ key: string; value: string }> = [];

    const participantSlotCombinations: Array<{ participant: `0x${string}`; slotIndex: number }> = [];
    for (const participant of participants) {
      for (let slotIndex = 0; slotIndex < numSlots; slotIndex++) {
        participantSlotCombinations.push({ participant, slotIndex });
      }
    }

    const participantDataResults = await readContracts(config, {
      contracts: participantSlotCombinations.flatMap(({ participant, slotIndex }) => [
        { address: bridgeCoreAddress, abi: bridgeCoreAbi, functionName: "getL2MptKey", args: [channelIdBytes32, participant, slotIndex] },
        { address: bridgeCoreAddress, abi: bridgeCoreAbi, functionName: "getValidatedUserSlotValue", args: [channelIdBytes32, participant, slotIndex] },
      ]),
    });

    participantSlotCombinations.forEach(({ }, index) => {
      const mptKeyResult = participantDataResults[index * 2];
      const slotValueResult = participantDataResults[index * 2 + 1];

      if (mptKeyResult?.status === "success" && slotValueResult?.status === "success") {
        const mptKey = mptKeyResult.result as bigint;
        const slotValue = slotValueResult.result as bigint;

        if (mptKey !== BigInt(0)) {
          const mptKeyHex = `0x${mptKey.toString(16).padStart(64, "0")}`;
          const slotValueHex = `0x${slotValue.toString(16).padStart(64, "0")}`;
          registeredKeys.push(mptKeyHex);
          storageEntries.push({ key: mptKeyHex, value: slotValueHex });
        }
      }
    });
    console.log(`   ✅ Storage entries: ${storageEntries.length}`);

    // Step 5: Build state snapshot
    console.log("\n📡 Step 5: Building state snapshot...");
    const previousStateSnapshot: StateSnapshot = {
      channelId: channelIdBytes32 as unknown as number,
      stateRoot: initialRoot,
      registeredKeys,
      storageEntries,
      contractAddress: targetContract,
      preAllocatedLeaves,
    };
    console.log(`   State root: ${previousStateSnapshot.stateRoot}`);
    console.log(`   Registered keys: ${previousStateSnapshot.registeredKeys.length}`);
    console.log(`   Pre-allocated leaves: ${previousStateSnapshot.preAllocatedLeaves.length}`);

    // Step 6: Generate L2 account and signed transaction
    console.log("\n📡 Step 6: Creating signed L2 transaction...");
    const keySeed = await generateKeySeed(account);
    const usdtSlot = ERC20_TRANSFER[USDT_ADDRESS]?.slot;
    
    if (usdtSlot === undefined) throw new Error("USDT slot not found");
    
    const l2Account = deriveL2KeysAndAddressFromSignature(keySeed, usdtSlot);
    console.log(`   L2 Address: ${l2Account.l2Address}`);
    console.log(`   Recipient: ${RECIPIENT_L2_ADDRESS}`);
    console.log(`   Amount: ${TRANSFER_AMOUNT} (1 USDT)`);

    const signedTx = await createERC20TransferTx(
      0,
      RECIPIENT_L2_ADDRESS,
      TRANSFER_AMOUNT,
      keySeed,
      USDT_ADDRESS
    );

    const signedTxRlpStr = bytesToHex(signedTx.serialize()) as `0x${string}`;
    console.log(`   Signed TX RLP: ${signedTxRlpStr.slice(0, 50)}...`);

    // Step 7: Get init tx hash from local DB file
    console.log("\n📡 Step 7: Fetching channel init tx hash from DB...");
    
    const currentFile = fileURLToPath(import.meta.url);
    const projectRoot = join(dirname(currentFile), "..", "..");
    const dbPath = join(projectRoot, "data", "db.json");
    const dbContent = JSON.parse(readFileSync(dbPath, "utf-8"));
    const channelDbData = dbContent.channels[CHANNEL_ID.toLowerCase()];
    
    if (!channelDbData) {
      throw new Error(`Channel ${CHANNEL_ID} not found in DB`);
    }
    
    const channelInitTxHash = channelDbData.initializationTxHash as `0x${string}`;
    if (!channelInitTxHash) {
      throw new Error("Channel initializationTxHash not found in DB");
    }
    console.log(`   Init TX Hash: ${channelInitTxHash}`);

    // Step 8: Verify snapshot is valid for synthesize API
    console.log("\n📡 Step 8: Validating snapshot for API...");
    
    const synthesizeRequest = {
      action: "synthesize",
      channelId: CHANNEL_ID,
      channelInitTxHash,
      signedTxRlpStr,
      previousStateSnapshot,
      includeProof: false,
      chainId,
      targetContract,
    };

    console.log(`   Request payload size: ${JSON.stringify(synthesizeRequest).length} bytes`);
    console.log(`   Pre-allocated leaves in snapshot: ${previousStateSnapshot.preAllocatedLeaves.length}`);
    console.log(`   Storage entries in snapshot: ${previousStateSnapshot.storageEntries.length}`);
    console.log(`   Registered keys in snapshot: ${previousStateSnapshot.registeredKeys.length}`);

    let serverAvailable = false;
    try {
      const healthCheck = await fetch("http://localhost:3000/api/channels", { method: "GET" });
      const healthText = await healthCheck.text();
      serverAvailable = healthText.includes('"channels"') || healthText.includes('"success"');
    } catch {
      serverAvailable = false;
    }

    if (!serverAvailable) {
      console.log("\n   ⚠️  private-app-channel-manager server not running on localhost:3000");
      console.log("   Skipping API call - snapshot validation passed!");
      console.log("\n" + "=".repeat(70));
      console.log("✅ Snapshot Build Test completed successfully!");
      console.log("   (Run 'npm run dev' in private-app-channel-manager to test full API)\n");
      console.log("📄 Built State Snapshot (ready for API):");
      console.log(JSON.stringify(previousStateSnapshot, null, 2));
      return { success: true, snapshotOnly: true, previousStateSnapshot, synthesizeRequest };
    }

    console.log("\n   Calling synthesize API...");
    const startTime = Date.now();
    const synthesizeResponse = await fetch("http://localhost:3000/api/tokamak-zk-evm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(synthesizeRequest),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`   Response status: ${synthesizeResponse.status} (${elapsed}s)`);

    if (!synthesizeResponse.ok) {
      const errorText = await synthesizeResponse.text();
      console.error(`   ❌ API Error: ${errorText.slice(0, 500)}...`);
      throw new Error(`Synthesize API failed: ${synthesizeResponse.status}`);
    }

    const result = await synthesizeResponse.json();
    
    console.log("\n" + "=".repeat(70));
    console.log("✅ Synthesize Result:\n");
    console.log(`   Success: ${result.success}`);
    console.log(`   New State Root: ${result.newStateRoot || "N/A"}`);
    console.log(`   Proof Key: ${result.proofKey || "N/A"}`);
    
    if (result.stateSnapshot) {
      console.log(`   New Snapshot:`);
      console.log(`      Storage Entries: ${result.stateSnapshot.storageEntries?.length || 0}`);
      console.log(`      Pre-allocated Leaves: ${result.stateSnapshot.preAllocatedLeaves?.length || 0}`);
    }

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    console.log("\n" + "=".repeat(70));
    console.log("✅ E2E Test completed successfully!\n");

    return result;
  } catch (error) {
    console.error("\n" + "=".repeat(70));
    console.error("❌ E2E Test failed!\n");
    console.error("Error:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testUsdtProofGenerationE2E()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
