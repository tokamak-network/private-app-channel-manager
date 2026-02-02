/**
 * Synthesize Stream API - Server-Sent Events endpoint for proof generation progress
 *
 * Sends progress updates as each step completes:
 * 1. synthesizer - L2 transaction synthesis
 * 2. making_proof - ZK proof generation
 * 3. verify - Proof verification
 * 4. completed - All done, includes download info
 */

import { NextRequest } from "next/server";
import { execFile, type ExecFileOptions } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import JSZip from "jszip";
import {
  assertPathExists,
  getTokamakDistRoot,
  getTokamakLibraryPath,
} from "@/lib/server/tokamak-utils";
import { getBlockInfo, getBlockNumber, getContractCode } from "@/lib/ethers";
import { StateSnapshot } from "tokamak-l2js";
import { bytesToHex } from "@ethereumjs/util";
import {
  FIXED_TARGET_CONTRACT,
  DEFAULT_NETWORK,
  NETWORKS,
  getTokenByAddress,
} from "@tokamak/config";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes timeout

const execFileAsync = promisify(execFile);

export type ProofGenerationStep =
  | "signing"
  | "synthesizer"
  | "making_proof"
  | "verify"
  | "completed"
  | "error";

interface ProgressEvent {
  step: ProofGenerationStep;
  message: string;
  error?: string;
  zipBase64?: string; // Only on completed
}

function createSSEMessage(data: ProgressEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  let body: {
    channelId: string;
    channelInitTxHash: `0x${string}`;
    signedTxRlpStr: `0x${string}`;
    previousStateSnapshot: StateSnapshot;
    chainId?: number;
    targetContract?: `0x${string}`;
  };

  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const {
    channelId: rawChannelId,
    channelInitTxHash,
    signedTxRlpStr,
    previousStateSnapshot,
    chainId,
    targetContract,
  } = body;

  const channelId = String(rawChannelId).toLowerCase();
  const targetChainId = chainId ?? NETWORKS[DEFAULT_NETWORK].id;

  const effectiveTargetContract = targetContract ?? FIXED_TARGET_CONTRACT;
  if (targetContract) {
    const tokenInfo = getTokenByAddress(targetContract);
    if (!tokenInfo) {
      return new Response(
        JSON.stringify({
          error: `Unsupported token address: ${targetContract}. Supported tokens: TON, USDT, USDC`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(createSSEMessage(event)));
      };

      let outputDir: string | undefined;

      try {
        const distRoot = getTokamakDistRoot();
        const jobId = Date.now();
        outputDir = path.join(
          distRoot,
          "outputs",
          `channel-${channelId}`,
          `transaction-${jobId}`
        );
        const synthOutputPath = path.join(
          distRoot,
          "resource",
          "synthesizer",
          "output"
        );
        await fs.mkdir(outputDir, { recursive: true });
        await fs.mkdir(synthOutputPath, { recursive: true });

        const tokamakCliPath = path.join(
          process.cwd(),
          "Tokamak-Zk-EVM",
          "tokamak-cli"
        );
        const libraryPath = getTokamakLibraryPath(distRoot);
        await assertPathExists(tokamakCliPath, "file");
        await assertPathExists(libraryPath, "dir");

        const baseEnv = {
          ...process.env,
          DYLD_LIBRARY_PATH: libraryPath,
        };

        // Helper function to run tokamak-cli
        const runTokamakCli = async (
          args: string[],
          options: ExecFileOptions = {}
        ) => {
          const { env, ...rest } = options;
          const { stdout, stderr } = await execFileAsync(tokamakCliPath, args, {
            cwd: distRoot,
            env: { ...baseEnv, ...env },
            ...rest,
          });

          if (stderr) {
            const stderrStr = String(stderr);
            const hasSynthesizerError =
              stderrStr.includes("Synthesizer: step error:") ||
              stderrStr.includes("Synthesizer: Handler:") ||
              stderrStr.includes("Undefined synthesizer handler");

            if (hasSynthesizerError) {
              const errorMatch = stderrStr.match(/error: (.+?)(?:\n|$)/);
              const errorMessage = errorMatch
                ? errorMatch[1]
                : "Synthesizer execution failed";
              throw new Error(`Synthesizer error: ${errorMessage}`);
            }
          }

          return { stdout, stderr };
        };

        // === STEP 1: Synthesizer ===
        sendProgress({
          step: "synthesizer",
          message: "Running L2 transaction synthesis...",
        });

        // Prepare files for synthesizer
        const initTxBlockNumber = await getBlockNumber(
          targetChainId,
          channelInitTxHash
        );
        const blockInfo = await getBlockInfo(targetChainId, initTxBlockNumber);
        const blockInfoPath = path.join(synthOutputPath, "block_info.json");
        await fs.writeFile(blockInfoPath, JSON.stringify(blockInfo, null, 2));

        const contractCode = await getContractCode(
          targetChainId,
          effectiveTargetContract,
          initTxBlockNumber
        );
        const contractCodesArray = [
          { address: effectiveTargetContract, code: bytesToHex(contractCode) },
        ];
        const contractCodePath = path.join(
          synthOutputPath,
          "contract_codes.json"
        );
        await fs.writeFile(
          contractCodePath,
          JSON.stringify(contractCodesArray, null, 2)
        );

        const previousStateSnapshotPath = path.join(
          synthOutputPath,
          "previous_state_snapshot.json"
        );
        await fs.writeFile(
          previousStateSnapshotPath,
          JSON.stringify(previousStateSnapshot, null, 2)
        );

        // Run synthesizer
        await runTokamakCli([
          "--synthesize",
          "--tokamak-ch-tx",
          "--previous-state",
          previousStateSnapshotPath,
          "--transaction",
          signedTxRlpStr,
          "--block-info",
          blockInfoPath,
          "--contract-code",
          contractCodePath,
        ]);

        // === STEP 2: Making Proof ===
        sendProgress({
          step: "making_proof",
          message: "Generating ZK proof...",
        });

        await runTokamakCli(["--prove"], {
          timeout: 600000, // 10 minutes timeout
        });

        // === STEP 3: Verify ===
        sendProgress({
          step: "verify",
          message: "Verifying proof...",
        });

        // Run preprocess first
        await runTokamakCli(["--preprocess"], {
          timeout: 300000,
        });

        // Run verify
        const { stdout: verifyStdout } = await runTokamakCli(["--verify"], {
          timeout: 300000,
        });

        const verifyOutput = verifyStdout.toString();
        const isVerified =
          verifyOutput.includes("Verify: verify output => true") ||
          verifyOutput.includes("✓") ||
          verifyOutput.toLowerCase().includes("success");

        if (!isVerified) {
          throw new Error("Proof verification failed: The generated proof is invalid.");
        }

        // === STEP 4: Extract and Complete ===
        const outputZipPath = path.join(
          outputDir,
          `l2-transaction-channel-${channelId}.zip`
        );
        await runTokamakCli(["--extract-proof", outputZipPath]);

        // Read ZIP and convert to base64
        const zipBuffer = await fs.readFile(outputZipPath);
        const zipBase64 = zipBuffer.toString("base64");

        sendProgress({
          step: "completed",
          message: "Proof generation completed successfully!",
          zipBase64,
        });

        // Clean up
        try {
          await fs.rm(outputDir, { recursive: true, force: true });
        } catch {}

      } catch (error: any) {
        console.error("Proof generation error:", error);

        let errorMessage = "Proof generation failed";
        if (error instanceof Error) {
          errorMessage = error.message;
        }

        sendProgress({
          step: "error",
          message: "Proof generation failed",
          error: errorMessage,
        });

        // Clean up on error
        if (outputDir) {
          try {
            await fs.rm(outputDir, { recursive: true, force: true });
          } catch {}
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
