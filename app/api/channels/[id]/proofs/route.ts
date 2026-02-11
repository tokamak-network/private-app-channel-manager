import { NextRequest, NextResponse } from "next/server";
import { getProofs } from "@/lib/db/channels";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/channels/:id/proofs - Get proofs for a channel
 * 
 * Case-insensitive lookup: Accepts channelId in any case format.
 * The getProofs function handles case normalization internally.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const resolvedParams = await params;
    const channelId = resolvedParams.id;
    const { searchParams } = new URL(request.url);
    const silent = searchParams.get("silent") === "true";
    
    const type = (searchParams.get("type") || "submitted") as
      | "submitted"
      | "verified"
      | "rejected";

    // getProofs handles case normalization internally
    const proofs = await getProofs(channelId, type);

    return NextResponse.json({ 
      success: true,
      data: proofs,
      proofs // Keep for backward compatibility
    });
  } catch (error) {
    console.error("Error fetching proofs:", error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch proofs" 
      },
      { status: 500 }
    );
  }
}
