import { NextResponse } from "next/server";
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
import { toOldStateSnapshot } from "@/lib/stateSnapshotCompat";
import {
  FIXED_TARGET_CONTRACT,
  DEFAULT_NETWORK,
  NETWORKS,
  getTokenByAddress,
  getCallCodeAddresses,
} from "@tokamak/config";
import { getProofs, saveProof, deleteProof } from "@/lib/db/channels";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes timeout for long-running synthesis

const execFileAsync = promisify(execFile);

export type SynthesizeTxRequest = {
  action: "synthesize";
  channelId: string;
  channelInitTxHash: `0x${string}`;
  signedTxRlpStr: `0x${string}`;
  previousStateSnapshot: StateSnapshot;
  includeProof: boolean;
  chainId?: number;
  targetContract?: `0x${string}`;
};

export type VerifyProofRequest = {
  action: "verify";
  proofZipBase64: string; // Base64 encoded ZIP file containing proof files
};

export type ApproveProofRequest = {
  action: "approve-proof";
  channelId: string;
  proofKey: string;
  sequenceNumber: number;
  verifierAddress: string;
};

export type TokamakZkEvmRequest =
  | SynthesizeTxRequest
  | VerifyProofRequest
  | ApproveProofRequest;

async function addDirToZip(zip: JSZip, dir: string, rootDir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await addDirToZip(zip, entryPath, rootDir);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const relativePath = path.relative(rootDir, entryPath);
    const data = await fs.readFile(entryPath);
    zip.file(relativePath, data);
  }
}

async function createZipFromDir(
  sourceDir: string,
  zipPath: string,
  extraFiles: Array<{ path: string; name?: string }> = []
) {
  const zip = new JSZip();
  await addDirToZip(zip, sourceDir, sourceDir);
  for (const file of extraFiles) {
    const name = file.name ?? path.basename(file.path);
    const data = await fs.readFile(file.path);
    zip.file(name, data);
  }
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  await fs.writeFile(zipPath, zipBuffer);
}

async function safeRemove(targetPath: string, label: string) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch (cleanupErr) {
    console.warn(`Failed to clean up ${label}:`, cleanupErr);
  }
}

async function handleApproveProof(body: ApproveProofRequest) {
  try {
    const { channelId: rawChannelId, proofKey, sequenceNumber, verifierAddress } = body;

    if (!rawChannelId || !proofKey || !sequenceNumber || !verifierAddress) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: channelId, proofKey, sequenceNumber, verifierAddress",
        },
        { status: 400 }
      );
    }

    // Normalize channelId to lowercase for consistent DB operations
    const channelId = String(rawChannelId).toLowerCase();

    // Get all submitted proofs
    const submittedProofs = await getProofs(channelId, "submitted");

    if (!submittedProofs || submittedProofs.length === 0) {
      return NextResponse.json(
        { error: "No submitted proofs found" },
        { status: 404 }
      );
    }

    // Find the proof to verify and others with same sequenceNumber
    const proofToVerify = submittedProofs.find((p) => p.key === proofKey);
    const sameSequenceProofs = submittedProofs.filter(
      (p) => p.sequenceNumber === sequenceNumber
    );

    if (!proofToVerify) {
      return NextResponse.json(
        { error: "Proof not found in submitted proofs" },
        { status: 404 }
      );
    }

    // Perform operations SEQUENTIALLY to avoid race conditions
    // (Parallel writes with lowdb can cause data loss)

    // 1. Move verified proof to verifiedProofs
    // Use Unix timestamp instead of ISO string to avoid timezone issues
    const verifiedProof = {
      ...proofToVerify,
      status: "verified" as const,
      verifiedAt: Date.now(), // Unix timestamp (milliseconds)
      verifiedBy: verifierAddress,
    };
    await saveProof(channelId, "verified", verifiedProof);

    // 2. Move other proofs with same sequenceNumber to rejectedProofs
    const rejectedProofs = sameSequenceProofs
      .filter((p) => p.key !== proofKey)
      .map((p) => ({
        ...p,
        status: "rejected" as const,
        rejectedAt: Date.now(), // Unix timestamp (milliseconds)
        rejectedBy: verifierAddress,
        reason: "Another proof was verified for this sequence",
      }));

    for (const rejectedProof of rejectedProofs) {
      await saveProof(channelId, "rejected", rejectedProof);
    }

    // 3. Remove all proofs from submittedProofs
    for (const proofToRemove of sameSequenceProofs) {
      if (proofToRemove.key) {
        await deleteProof(channelId, "submitted", proofToRemove.key);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Proof verified successfully",
      verifiedProof: {
        proofId: (verifiedProof as any).proofId || verifiedProof.key,
        sequenceNumber: verifiedProof.sequenceNumber,
      },
      rejectedCount: rejectedProofs.length,
    });
  } catch (error) {
    console.error("Error approving proof:", error);
    return NextResponse.json(
      {
        error: "Failed to approve proof",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function handleVerify(body: VerifyProofRequest) {
  const { proofZipBase64 } = body;
  const tokamakRoot = path.join(process.cwd(), "Tokamak-Zk-EVM");
  const tokamakCli = path.join(tokamakRoot, "tokamak-cli");
  const tempDir = path.join(tokamakRoot, "temp", `verify-${Date.now()}`);

  try {
    if (!proofZipBase64) {
      return NextResponse.json(
        { error: "Missing required field: proofZipBase64" },
        { status: 400 }
      );
    }

    // Check if tokamak-cli exists
    await assertPathExists(tokamakCli, "file");

    // Create temp directory with resource structure
    const resourceDir = path.join(tempDir, "resource");
    const synthesizerOutputDir = path.join(
      resourceDir,
      "synthesizer",
      "output"
    );
    const proveOutputDir = path.join(resourceDir, "prove", "output");
    await fs.mkdir(synthesizerOutputDir, { recursive: true });
    await fs.mkdir(proveOutputDir, { recursive: true });

    // Decode and extract ZIP file
    const zipBuffer = Buffer.from(proofZipBase64, "base64");
    const zip = await JSZip.loadAsync(zipBuffer);

    // Extract files to appropriate locations in resource structure
    for (const [filePath, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

      const fileName = path.basename(filePath);
      const content = await file.async("nodebuffer");

      if (fileName === "proof.json") {
        // Proof file goes to resource/prove/output/
        await fs.writeFile(path.join(proveOutputDir, fileName), content);
      } else if (
        fileName === "instance.json" ||
        fileName === "state_snapshot.json" ||
        fileName === "placementVariables.json" ||
        fileName === "instance_description.json" ||
        fileName === "permutation.json"
      ) {
        // Synthesizer output files go to resource/synthesizer/output/
        await fs.writeFile(path.join(synthesizerOutputDir, fileName), content);
      }
    }

    // Check if required files exist
    const requiredFiles = {
      "instance.json": path.join(synthesizerOutputDir, "instance.json"),
      "proof.json": path.join(proveOutputDir, "proof.json"),
    };

    for (const [name, filePath] of Object.entries(requiredFiles)) {
      try {
        await fs.access(filePath);
      } catch {
        return NextResponse.json(
          {
            error: `Missing required file in ZIP: ${name}`,
            verified: false,
          },
          { status: 400 }
        );
      }
    }

    console.log("Using tokamak-cli for verification");
    console.log("Temp directory:", tempDir);

    const distRoot = getTokamakDistRoot();
    const distResourceDir = path.join(distRoot, "resource");
    const distSynthesizerDir = path.join(
      distResourceDir,
      "synthesizer",
      "output"
    );
    const distPreprocessDir = path.join(
      distResourceDir,
      "preprocess",
      "output"
    );
    const distProveDir = path.join(distResourceDir, "prove", "output");

    // Create dist resource directories
    await fs.mkdir(distSynthesizerDir, { recursive: true });
    await fs.mkdir(distPreprocessDir, { recursive: true });
    await fs.mkdir(distProveDir, { recursive: true });

    // Copy synthesizer files to dist
    const synthFiles = await fs.readdir(synthesizerOutputDir);
    for (const file of synthFiles) {
      await fs.copyFile(
        path.join(synthesizerOutputDir, file),
        path.join(distSynthesizerDir, file)
      );
    }

    // Copy proof file to dist
    await fs.copyFile(
      path.join(proveOutputDir, "proof.json"),
      path.join(distProveDir, "proof.json")
    );

    // STEP 1: Run preprocess using tokamak-cli
    console.log("Running preprocess...");
    const preprocessCommand = `"${tokamakCli}" --preprocess`;
    console.log("Executing:", preprocessCommand);

    try {
      const { stdout: preprocessStdout, stderr: preprocessStderr } =
        await execFileAsync(tokamakCli, ["--preprocess"], {
          cwd: tokamakRoot,
          timeout: 300000, // 5 minutes timeout
        });

      console.log("Preprocess completed");
      if (preprocessStdout) console.log("Preprocess stdout:", preprocessStdout);
      if (preprocessStderr)
        console.warn("Preprocess stderr:", preprocessStderr);
    } catch (preprocessError: any) {
      console.error("Preprocess execution error:", preprocessError);

      // Clean up temp and dist directories
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        const distFiles = [
          path.join(distSynthesizerDir, "instance.json"),
          path.join(distProveDir, "proof.json"),
        ];
        for (const file of distFiles) {
          try {
            await fs.unlink(file);
          } catch {}
        }
      } catch (cleanupErr) {
        console.warn("Failed to clean up:", cleanupErr);
      }

      return NextResponse.json({
        verified: false,
        message: "Preprocess failed",
        error: preprocessError.message,
        stderr: preprocessError.stderr || undefined,
      });
    }

    // STEP 2: Run verify using tokamak-cli
    console.log("Running verify...");
    const verifyCommand = `"${tokamakCli}" --verify`;
    console.log("Executing:", verifyCommand);

    try {
      const { stdout, stderr } = await execFileAsync(tokamakCli, ["--verify"], {
        cwd: tokamakRoot,
        timeout: 300000, // 5 minutes timeout
      });

      console.log("Verify stdout:", stdout);
      if (stderr) {
        console.warn("Verify stderr:", stderr);
      }

      // Clean up temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        const distFiles = [
          path.join(distSynthesizerDir, "instance.json"),
          path.join(distProveDir, "proof.json"),
        ];
        for (const file of distFiles) {
          try {
            await fs.unlink(file);
          } catch {}
        }
      } catch (cleanupErr) {
        console.warn("Failed to clean up:", cleanupErr);
      }

      // Check if verification passed
      const isVerified =
        stdout.includes("Verify: verify output => true") ||
        stdout.includes("✓") ||
        stdout.toLowerCase().includes("success");

      return NextResponse.json({
        verified: isVerified,
        message: isVerified
          ? "Proof verification successful ✓"
          : "Proof verification failed - invalid proof",
        output: stdout,
        stderr: stderr || undefined,
      });
    } catch (execError: any) {
      console.error("Verify execution error:", execError);

      // Clean up directories
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        const distFiles = [
          path.join(distSynthesizerDir, "instance.json"),
          path.join(distProveDir, "proof.json"),
        ];
        for (const file of distFiles) {
          try {
            await fs.unlink(file);
          } catch {}
        }
      } catch (cleanupErr) {
        console.warn("Failed to clean up:", cleanupErr);
      }

      return NextResponse.json({
        verified: false,
        message: "Proof verification failed",
        error: execError.message,
        stderr: execError.stderr || undefined,
      });
    }
  } catch (error: any) {
    console.error("Failed to verify proof:", error);

    // Clean up temp directory on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn("Failed to clean up temp directory:", cleanupErr);
    }

    return NextResponse.json(
      {
        error: "Failed to verify proof",
        details: error instanceof Error ? error.message : String(error),
        verified: false,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  let outputDir: string | undefined = undefined;
  let tempDir: string | undefined = undefined;

  try {
    const body: TokamakZkEvmRequest = await req.json();

    // Route based on action
    if (body.action === "verify") {
      return await handleVerify(body);
    }

    if (body.action === "approve-proof") {
      return await handleApproveProof(body);
    }

    const {
      channelId: rawChannelId,
      channelInitTxHash,
      signedTxRlpStr,
      previousStateSnapshot,
      includeProof = false,
      chainId,
      targetContract,
    } = body;

    const channelId = String(rawChannelId).toLowerCase();
    const targetChainId = chainId ?? NETWORKS[DEFAULT_NETWORK].id;

    const effectiveTargetContract = targetContract ?? FIXED_TARGET_CONTRACT;
    if (targetContract) {
      const tokenInfo = getTokenByAddress(targetContract);
      if (!tokenInfo) {
        return NextResponse.json(
          {
            error: `Unsupported token address: ${targetContract}. Supported tokens: TON, USDT, USDC`,
          },
          { status: 400 }
        );
      }
    }

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

    const initTxBlockNumber = await getBlockNumber(
      targetChainId,
      channelInitTxHash
    );
    const blockInfo = await getBlockInfo(targetChainId, initTxBlockNumber);
    const blockInfoJson = JSON.stringify(blockInfo, undefined, 2);
    const blockInfoPath = path.join(synthOutputPath, "block_info.json");
    await fs.writeFile(blockInfoPath, blockInfoJson);

    const codeAddresses = getCallCodeAddresses(effectiveTargetContract);
    const contractCodesArray = await Promise.all(
      codeAddresses.map(async (addr) => ({
        address: addr,
        code: bytesToHex(await getContractCode(targetChainId, addr, initTxBlockNumber)),
      }))
    );
    const contractCodeJson = JSON.stringify(contractCodesArray, undefined, 2);
    const contractCodePath = path.join(synthOutputPath, "contract_codes.json");
    await fs.writeFile(contractCodePath, contractCodeJson);

    // tokamak-cli uses tokamak-l2js 0.0.13 (old format)
    const snapshotForCli = toOldStateSnapshot(previousStateSnapshot);
    const previousStateSnapshotJson = JSON.stringify(
      snapshotForCli,
      undefined,
      2
    );
    const previousStateSnapshotPath = path.join(
      synthOutputPath,
      "previous_state_snapshot.json"
    );
    await fs.writeFile(previousStateSnapshotPath, previousStateSnapshotJson);

    await assertPathExists(distRoot, "dir");

    // Build command
    const tokamakCliPath = path.join(
      process.cwd(),
      "Tokamak-Zk-EVM",
      "tokamak-cli"
    );
    const libraryPath = getTokamakLibraryPath(distRoot);
    await assertPathExists(tokamakCliPath, "file");
    await assertPathExists(libraryPath, "dir");

    const outputZipName = `l2-transaction-channel-${channelId}.zip`;
    const outputZipPath = path.join(outputDir, outputZipName);

    const baseEnv = {
      ...process.env,
      DYLD_LIBRARY_PATH: libraryPath,
    };

    const runTokamakCli = async (
      args: string[],
      options: ExecFileOptions = {}
    ) => {
      const label = args[0];
      const { env, ...rest } = options;
      const commandDisplay = [tokamakCliPath, ...args].join(" ");
      console.log(`Executing tokamak-cli ${label} command:`, commandDisplay);

      try {
        const { stdout, stderr } = await execFileAsync(tokamakCliPath, args, {
          cwd: distRoot,
          env: { ...baseEnv, ...env },
          ...rest,
        });

        if (stdout) {
          console.log(`--${label} stdout:`, stdout);
        }

        if (stderr) {
          console.warn(`--${label} stderr:`, stderr);

          // Check for synthesizer errors in stderr
          const stderrStr = String(stderr);
          const hasSynthesizerError =
            stderrStr.includes("Synthesizer: step error:") ||
            stderrStr.includes("Synthesizer: Handler:") ||
            (stderrStr.includes("Synthesizer:") &&
              stderrStr.includes("Output data mismatch")) ||
            (stderrStr.includes("Synthesizer:") &&
              stderrStr.includes("error:")) ||
            stderrStr.includes("Undefined synthesizer handler");

          if (hasSynthesizerError) {
            // Extract the first error message
            const errorMatch = stderrStr.match(/error: (.+?)(?:\n|$)/);
            const errorMessage = errorMatch
              ? errorMatch[1]
              : "Synthesizer execution failed";

            throw new Error(`Synthesizer error: ${errorMessage}`);
          }
        }
      } catch (execError: any) {
        // If execFileAsync throws, check stderr for synthesizer errors
        if (execError.stderr) {
          const stderrStr = String(execError.stderr);
          const hasSynthesizerError =
            stderrStr.includes("Synthesizer: step error:") ||
            stderrStr.includes("Synthesizer: Handler:") ||
            (stderrStr.includes("Synthesizer:") &&
              stderrStr.includes("Output data mismatch")) ||
            (stderrStr.includes("Synthesizer:") &&
              stderrStr.includes("error:")) ||
            stderrStr.includes("Undefined synthesizer handler");

          if (hasSynthesizerError) {
            const errorMatch = stderrStr.match(/error: (.+?)(?:\n|$)/);
            const errorMessage = errorMatch
              ? errorMatch[1]
              : "Synthesizer execution failed";

            throw new Error(`Synthesizer error: ${errorMessage}`);
          }
        }

        // Re-throw the original error
        throw execError;
      }
    };

    // STEP 1: Execute L2 transaction synthesis using tokamak-cli
    console.log("Running tokamak-cli synthesize...");
    try {
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
    } catch (synthesizeError: any) {
      console.error("Synthesize failed:", synthesizeError);
      throw new Error(
        `Synthesis failed: ${synthesizeError.message || "Unknown error"}`
      );
    }

    await assertPathExists(synthOutputPath, "dir");

    // STEP 2: If includeProof is true, run prove, verify, and extract proof bundle
    if (includeProof) {
      console.log("Running tokamak-cli prove...");
      try {
        await runTokamakCli(["--prove"], {
          timeout: 600000, // 10 minutes timeout
        });
      } catch (proveError: any) {
        console.error("Prove failed:", proveError);
        throw new Error(
          `Proof generation failed: ${proveError.message || "Unknown error"}`
        );
      }

      // STEP 3: Verify the generated proof before extracting
      console.log("Running tokamak-cli preprocess for verification...");
      try {
        await runTokamakCli(["--preprocess"], {
          timeout: 300000, // 5 minutes timeout
        });
      } catch (preprocessError: any) {
        console.error("Preprocess for verification failed:", preprocessError);
        throw new Error(
          `Proof verification setup failed: ${preprocessError.message || "Unknown error"}`
        );
      }

      console.log("Running tokamak-cli verify...");
      try {
        const { stdout: verifyStdout } = await execFileAsync(
          tokamakCliPath,
          ["--verify"],
          {
            cwd: distRoot,
            env: baseEnv,
            timeout: 300000, // 5 minutes timeout
          }
        );

        console.log("Verify stdout:", verifyStdout);

        // Check if verification passed
        const isVerified =
          verifyStdout.includes("Verify: verify output => true") ||
          verifyStdout.includes("✓") ||
          verifyStdout.toLowerCase().includes("success");

        if (!isVerified) {
          console.error("Proof verification failed - invalid proof");
          throw new Error(
            "Proof verification failed: The generated proof is invalid. Please try again."
          );
        }

        console.log("✅ Proof verification passed!");
      } catch (verifyError: any) {
        console.error("Verify failed:", verifyError);
        // If it's already our custom error, re-throw it
        if (verifyError.message?.includes("Proof verification failed")) {
          throw verifyError;
        }
        throw new Error(
          `Proof verification failed: ${verifyError.message || "Unknown error"}`
        );
      }

      // STEP 4: Extract proof bundle (only after successful verification)
      console.log("Extracting proof bundle...");
      await runTokamakCli(["--extract-proof", outputZipPath]);

      await assertPathExists(outputZipPath, "file");
    } else {
      await fs.mkdir(outputDir, { recursive: true });
      await createZipFromDir(synthOutputPath, outputZipPath);
    }
    // Return ZIP file
    const zipBufferNode = await fs.readFile(outputZipPath);
    return new NextResponse(zipBufferNode, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=${outputZipName}"`,
      },
    });
  } catch (error: any) {
    console.error("tokamak-zk-evm POST failed:", error);
    if (outputDir) {
      await safeRemove(outputDir, "output directory");
    }

    // Extract meaningful error message from stderr if available
    let errorMessage = "Failed to synthesize L2 transaction";
    let errorDetails = error instanceof Error ? error.message : String(error);

    if (error?.stderr) {
      // Extract the actual error message from stderr
      const stderrStr = String(error.stderr);
      if (stderrStr.includes("Transaction failed:")) {
        errorMessage = "L2 transaction synthesis failed";
        // Extract the specific error
        const match = stderrStr.match(/Transfer failed: (.+)/);
        if (match) {
          errorDetails = match[1];
        }
      } else if (stderrStr.includes("error:")) {
        const match = stderrStr.match(/error: (.+)/);
        if (match) {
          errorDetails = match[1];
        }
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 }
    );
  }
}
