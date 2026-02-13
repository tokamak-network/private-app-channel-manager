import { NextRequest, NextResponse } from "next/server";
import { getData } from "@/lib/db";
import fs from "fs/promises";
import path from "path";
import JSZip from "jszip";

/**
 * GET /api/get-latest-state-snapshot?channelId=xxx
 *
 * Returns the state_snapshot from the latest verified proof for the channel.
 * This is used as the previous_state_snapshot when generating a new proof.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");

    if (!channelId) {
      return NextResponse.json(
        { error: "Missing required parameter: channelId" },
        { status: 400 }
      );
    }

    // Normalize channelId to lowercase for consistent DB lookup
    const channelIdStr = String(channelId).toLowerCase();

    // Get all verified proofs for the channel
    const verifiedProofsPath = `channels.${channelIdStr}.verifiedProofs`;
    const verifiedProofs = await getData<Record<string, any>>(verifiedProofsPath);

    if (!verifiedProofs || Object.keys(verifiedProofs).length === 0) {
      return NextResponse.json(
        { 
          success: false,
          error: "No verified proofs found for this channel",
          snapshot: null
        },
        { status: 404 }
      );
    }

    // Convert to array and sort by sequence number (descending to get latest first)
    const proofsArray = Object.entries(verifiedProofs).map(([key, value]) => ({
      key,
      ...(typeof value === 'object' ? value : {}),
    }));

    proofsArray.sort((a, b) => {
      const seqA = a.sequenceNumber || 0;
      const seqB = b.sequenceNumber || 0;
      if (seqA !== seqB) return seqB - seqA;
      // If sequence numbers are equal, sort by sub number
      const subA = a.subNumber || 0;
      const subB = b.subNumber || 0;
      return subB - subA;
    });

    // Get the latest verified proof
    const latestProof = proofsArray[0];
    const proofId = latestProof.key;

    console.log("[get-latest-state-snapshot] Latest verified proof:", {
      channelId: channelIdStr,
      proofId,
      sequenceNumber: latestProof.sequenceNumber,
      subNumber: latestProof.subNumber,
      hasZipFile: !!latestProof.zipFile,
    });

    // Get ZIP file metadata directly from the proof object
    // (zipFile is already included in the verifiedProofs data)
    const zipMetadata = latestProof.zipFile as {
      filePath?: string;
      content?: string;
      fileName: string;
      size: number;
    } | undefined;

    if (!zipMetadata) {
      return NextResponse.json(
        { 
          success: false,
          error: "ZIP file metadata not found for the latest verified proof",
          snapshot: null
        },
        { status: 404 }
      );
    }

    // Read the ZIP file
    let zipBuffer: Buffer;
    
    if (zipMetadata.filePath) {
      // New format: read from file
      const absolutePath = path.resolve(process.cwd(), zipMetadata.filePath);
      const uploadsDir = path.join(process.cwd(), "data", "uploads");

      // Security check: Ensure the path is within the uploads directory
      if (!absolutePath.startsWith(uploadsDir)) {
        console.error("Path traversal attempt detected:", zipMetadata.filePath);
        return NextResponse.json(
          { error: "Invalid file path" },
          { status: 403 }
        );
      }

      zipBuffer = await fs.readFile(absolutePath);
    } else if (zipMetadata.content) {
      // Legacy format: base64 content stored in database
      zipBuffer = Buffer.from(zipMetadata.content, "base64");
    } else {
      return NextResponse.json(
        { 
          success: false,
          error: "ZIP file content not found",
          snapshot: null
        },
        { status: 404 }
      );
    }

    // Parse the ZIP file
    const zip = await JSZip.loadAsync(zipBuffer);

    // Find state_snapshot.json in the ZIP
    let stateSnapshotJson: string | null = null;
    const files = Object.keys(zip.files);
    
    for (const filePath of files) {
      const fileName = filePath.split("/").pop()?.toLowerCase();
      if (fileName === "state_snapshot.json") {
        const file = zip.file(filePath);
        if (file) {
          stateSnapshotJson = await file.async("string");
          break;
        }
      }
    }

    if (!stateSnapshotJson) {
      return NextResponse.json(
        { 
          success: false,
          error: "state_snapshot.json not found in the latest verified proof ZIP",
          snapshot: null
        },
        { status: 404 }
      );
    }

    // Parse and return the snapshot
    const snapshot = JSON.parse(stateSnapshotJson);

    console.log("[get-latest-state-snapshot] Successfully retrieved state snapshot:", {
      channelId: channelIdStr,
      proofId,
      stateRoot: snapshot.stateRoots?.[0] ?? snapshot.stateRoot,
      storageEntriesCount: snapshot.storageEntries?.[0]?.length ?? snapshot.storageEntries?.length ?? 0,
      registeredKeysCount: snapshot.registeredKeys?.[0]?.length ?? snapshot.registeredKeys?.length ?? 0,
      hasPreAllocatedLeaves: !!(snapshot.preAllocatedLeaves?.[0]?.length ?? snapshot.preAllocatedLeaves?.length),
    });

    return NextResponse.json({
      success: true,
      snapshot,
      proofId,
      sequenceNumber: latestProof.sequenceNumber,
      subNumber: latestProof.subNumber,
    });
  } catch (error) {
    console.error("[get-latest-state-snapshot] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get latest state snapshot",
        details: error instanceof Error ? error.message : "Unknown error",
        snapshot: null
      },
      { status: 500 }
    );
  }
}
