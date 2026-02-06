/**
 * API Route: Get L2 MPT Key for a participant
 *
 * Returns the L2 MPT key (storage key) for a participant in a channel.
 * This is used to match participant balances in the state snapshot.
 */

import { NextRequest, NextResponse } from "next/server";
import { http, createConfig } from "@wagmi/core";
import { readContracts } from "@wagmi/core";
import { getContractAddress, getContractAbi, NETWORKS } from "@tokamak/config";

const { sepolia } = NETWORKS;

const rpcUrl =
  process.env.RPC_URL ||
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ||
  "https://rpc.sepolia.org";

const config = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(rpcUrl, {
      timeout: 30_000,
    }),
  },
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const participant = searchParams.get("participant");
    const slotIndexStr = searchParams.get("slotIndex") || "0";

    if (!channelId) {
      return NextResponse.json(
        { error: "Missing required parameter: channelId" },
        { status: 400 }
      );
    }

    if (!participant) {
      return NextResponse.json(
        { error: "Missing required parameter: participant" },
        { status: 400 }
      );
    }

    const slotIndex = parseInt(slotIndexStr, 10);
    if (isNaN(slotIndex) || slotIndex < 0) {
      return NextResponse.json(
        { error: "Invalid slotIndex parameter" },
        { status: 400 }
      );
    }

    const bridgeCoreAddress = getContractAddress("BridgeCore", sepolia.id);
    const bridgeCoreAbi = getContractAbi("BridgeCore");

    // Get L2 MPT key for the participant
    const results = await readContracts(config, {
      contracts: [
        {
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getL2MptKey",
          args: [
            channelId as `0x${string}`,
            participant as `0x${string}`,
            slotIndex,
          ],
          chainId: sepolia.id,
        },
      ],
    });

    const result = results[0];
    if (result.status !== "success" || result.result === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to get L2 MPT key from contract",
        },
        { status: 500 }
      );
    }

    const l2MptKey = result.result as bigint;

    // Convert to hex string
    const l2MptKeyHex = `0x${l2MptKey.toString(16).padStart(64, "0")}`;

    console.log("[get-l2-mpt-key] Result:", {
      channelId,
      participant,
      slotIndex,
      l2MptKey: l2MptKeyHex,
    });

    return NextResponse.json({
      success: true,
      channelId,
      participant,
      slotIndex,
      l2MptKey: l2MptKeyHex,
      l2MptKeyBigInt: l2MptKey.toString(),
    });
  } catch (error) {
    console.error("[get-l2-mpt-key] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to get L2 MPT key",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
