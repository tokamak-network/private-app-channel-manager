/**
 * Save Channel Utility
 *
 * Utility function for saving channel information to database after creation
 */

import { type TokenSymbol } from "@tokamak/config";

// App types for channel (extensible for future app types)
export type AppType = "ERC20" | null;

export interface SaveChannelParams {
  channelId: string;
  txHash: string;
  targetContract: string;
  participants: string[];
  blockNumber: string;
  blockTimestamp?: string;
  appType?: AppType;
  /** Selected tokens for multi-token support */
  selectedTokens?: TokenSymbol[];
}

/**
 * Save channel information to database
 *
 * @param params - Channel information to save
 * @returns Promise that resolves when channel is saved
 */
export async function saveChannelToDatabase(
  params: SaveChannelParams
): Promise<void> {
  const { channelId, txHash, targetContract, participants, blockNumber, blockTimestamp, appType, selectedTokens } = params;

  console.log("[saveChannelToDatabase] Starting save for channel:", channelId);
  console.log("[saveChannelToDatabase] Params:", {
    channelId,
    txHash,
    targetContract,
    participants,
    blockNumber,
    appType,
    selectedTokens,
  });

  const apiUrl = `/api/channels/${channelId}/save`;
  console.log("[saveChannelToDatabase] API URL:", apiUrl);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        txHash,
        targetContract,
        participants,
        blockNumber,
        blockTimestamp,
        appType,
        selectedTokens,
      }),
    });

    console.log("[saveChannelToDatabase] Response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[saveChannelToDatabase] Failed:", errorData);
      throw new Error(errorData.error || "Failed to save channel to database");
    }

    const result = await response.json();
    console.log("[saveChannelToDatabase] Success:", result);
  } catch (error) {
    console.error("[saveChannelToDatabase] Exception:", error);
    throw error;
  }
}
