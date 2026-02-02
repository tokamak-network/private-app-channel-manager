import { NextResponse } from "next/server";
import { saveChannel } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/channels/:id/save - Save channel information after creation
 * 
 * Saves channel information to the database based on transaction receipt.
 * 
 * Storage normalization: Channel ID is automatically normalized to lowercase
 * before saving. This ensures consistent storage regardless of input case.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    console.log('[API] POST /api/channels/:id/save - Channel ID:', id);
    console.log('[API] POST /api/channels/:id/save - Will be normalized to:', id.toLowerCase());
    
    let body;
    try {
      body = await request.json();
      console.log('[API] POST /api/channels/:id/save - Request body:', JSON.stringify(body, null, 2));
    } catch (parseError) {
      console.error('[API] POST /api/channels/:id/save - Failed to parse request body:', parseError);
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const {
      txHash,
      targetContract,
      participants,
      blockNumber,
      blockTimestamp,
      appType,
    } = body;

    // Validation
    if (!txHash || !targetContract || !participants) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: txHash, targetContract, participants",
        },
        { status: 400 }
      );
    }

    const channelData = {
      channelId: id,
      status: "pending" as const,
      targetContract,
      participants: Array.isArray(participants) ? participants : [participants],
      openChannelTxHash: txHash,
      blockNumber: blockNumber?.toString(),
      blockTimestamp: blockTimestamp?.toString(),
      createdAt: Date.now(),
      appType: appType || null,
    };
    console.log('[API] POST /api/channels/:id/save - Saving channel data:', JSON.stringify(channelData, null, 2));
    
    await saveChannel(id, channelData);
    console.log('[API] POST /api/channels/:id/save - Channel saved successfully');

    return NextResponse.json({
      success: true,
      data: {
        channelId: id,
        message: "Channel information saved successfully",
      },
    });
  } catch (error) {
    console.error("Error saving channel:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to save channel",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
