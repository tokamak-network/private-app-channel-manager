/**
 * API Route: Get Balance Slot Index for a target contract
 *
 * Returns the balance slot index configured for a target contract.
 * This is used to determine which storage slot holds the balance for each token.
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
    const targetContract = searchParams.get("targetContract");

    if (!targetContract) {
      return NextResponse.json(
        { error: "Missing required parameter: targetContract" },
        { status: 400 }
      );
    }

    const bridgeCoreAddress = getContractAddress("BridgeCore", sepolia.id);
    const bridgeCoreAbi = getContractAbi("BridgeCore");

    // Get balance slot index for the target contract
    const results = await readContracts(config, {
      contracts: [
        {
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: "getBalanceSlotIndex",
          args: [targetContract as `0x${string}`],
          chainId: sepolia.id,
        },
      ],
    });

    const result = results[0];
    if (result.status !== "success" || result.result === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to get balance slot index from contract",
        },
        { status: 500 }
      );
    }

    const slotIndex = Number(result.result);

    console.log("[get-balance-slot-index] Result:", {
      targetContract,
      slotIndex,
    });

    return NextResponse.json({
      success: true,
      targetContract,
      slotIndex,
    });
  } catch (error) {
    console.error("[get-balance-slot-index] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to get balance slot index",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
