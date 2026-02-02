/**
 * Hook for proof generation with SSE progress tracking
 *
 * Uses Server-Sent Events to track progress through:
 * synthesizer -> making_proof -> verify -> completed
 */

import { useState, useCallback, useRef } from "react";
import { useAccount } from "wagmi";
import JSZip from "jszip";
import type { ProofGenerationStep } from "../_components/ProofGenerationModal";
import type { StateSnapshot } from "tokamak-l2js";

interface UseProofGenerationParams {
  channelId: string | null;
  onStepChange?: (step: ProofGenerationStep) => void;
}

interface UseProofGenerationReturn {
  generateProofWithProgress: (params: {
    keySeed: `0x${string}`;
    recipient: `0x${string}`;
    tokenAmount: string;
    initTxHash: `0x${string}`;
    previousStateSnapshot: StateSnapshot;
  }) => Promise<void>;
  currentStep: ProofGenerationStep;
  isGenerating: boolean;
  error: string | null;
  reset: () => void;
  downloadProof: () => void;
  hasGeneratedProof: boolean;
}

export function useProofGeneration({
  channelId,
  onStepChange,
}: UseProofGenerationParams): UseProofGenerationReturn {
  const { address } = useAccount();
  const [currentStep, setCurrentStep] = useState<ProofGenerationStep>("idle");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [generatedProofBlob, setGeneratedProofBlob] = useState<Blob | null>(null);
  const [generatedProofFileName, setGeneratedProofFileName] = useState<string | null>(null);

  const updateStep = useCallback(
    (step: ProofGenerationStep) => {
      setCurrentStep(step);
      onStepChange?.(step);
    },
    [onStepChange]
  );

  const generateProofWithProgress = useCallback(
    async (params: {
      keySeed: `0x${string}`;
      recipient: `0x${string}`;
      tokenAmount: string;
      initTxHash: `0x${string}`;
      previousStateSnapshot: StateSnapshot;
    }) => {
      if (!channelId || !address) {
        throw new Error("Missing channel ID or wallet connection");
      }

      setIsGenerating(true);
      setError(null);

      // Create abort controller for cleanup
      abortControllerRef.current = new AbortController();

      try {
        // Import required modules for creating signed transaction
        const { createERC20TransferTx } = await import(
          "@/lib/createERC20TransferTx"
        );
        const { bytesToHex } = await import("@ethereumjs/util");
        const { TON_TOKEN_ADDRESS } = await import("@tokamak/config");
        const { parseInputAmount } = await import("@/lib/utils/format");

        // Create signed L2 transaction
        const amountInWei = parseInputAmount(params.tokenAmount.trim(), 18);
        const signedTx = await createERC20TransferTx(
          0,
          params.recipient,
          amountInWei,
          params.keySeed,
          TON_TOKEN_ADDRESS
        );
        const signedTxStr = bytesToHex(signedTx.serialize());

        // Make SSE request
        const response = await fetch("/api/tokamak-zk-evm/synthesize-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId: channelId.toLowerCase(),
            channelInitTxHash: params.initTxHash,
            signedTxRlpStr: signedTxStr,
            previousStateSnapshot: params.previousStateSnapshot,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to start proof generation");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let zipBase64: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                updateStep(data.step);

                if (data.step === "error") {
                  throw new Error(data.error || "Proof generation failed");
                }

                if (data.step === "completed" && data.zipBase64) {
                  zipBase64 = data.zipBase64;
                }
              } catch (parseError) {
                if (
                  parseError instanceof Error &&
                  parseError.message !== "Proof generation failed"
                ) {
                  console.warn("Failed to parse SSE event:", parseError);
                } else {
                  throw parseError;
                }
              }
            }
          }
        }

        if (!zipBase64) {
          throw new Error("No proof data received");
        }

        // Convert base64 to blob
        const zipBuffer = Uint8Array.from(atob(zipBase64), (c) =>
          c.charCodeAt(0)
        );
        const zipBlob = new Blob([zipBuffer], { type: "application/zip" });

        // Get next proof number
        const proofNumberResponse = await fetch("/api/get-next-proof-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId: channelId.toLowerCase() }),
        });

        if (!proofNumberResponse.ok) {
          throw new Error("Failed to get next proof number");
        }

        const { proofNumber, subNumber, proofId, storageProofId } =
          await proofNumberResponse.json();

        // Reconstruct ZIP with new folder structure
        const reconstructedZipBlob = await reconstructZip(
          zipBlob,
          channelId,
          proofNumber
        );

        // Upload to storage
        const formData = new FormData();
        formData.append(
          "file",
          new File([reconstructedZipBlob], `proof-${proofId}.zip`, {
            type: "application/zip",
          })
        );
        formData.append("channelId", channelId.toLowerCase());
        formData.append("proofId", storageProofId);

        const uploadResponse = await fetch("/api/save-proof-zip", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error("Failed to upload proof");
        }

        // Save proof metadata to DB
        const proofMetadata = {
          proofId: proofId,
          sequenceNumber: proofNumber,
          subNumber: subNumber,
          submittedAt: Date.now(),
          submitter: address,
          timestamp: Date.now(),
          uploadStatus: "complete",
          status: "pending",
          channelId: channelId.toLowerCase(),
        };

        await fetch("/api/db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: `channels.${channelId.toLowerCase()}.submittedProofs.${storageProofId}`,
            data: proofMetadata,
            operation: "update",
          }),
        });

        // Store the ZIP blob for optional download
        setGeneratedProofBlob(reconstructedZipBlob);
        setGeneratedProofFileName(`l2-transaction-channel-${channelId}.zip`);

        updateStep("completed");
      } catch (err) {
        console.error("Proof generation error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Proof generation failed";
        setError(errorMessage);
        updateStep("error");
        throw err;
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    },
    [channelId, address, updateStep]
  );

  const reset = useCallback(() => {
    // Abort any in-progress request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setCurrentStep("idle");
    setIsGenerating(false);
    setError(null);
    setGeneratedProofBlob(null);
    setGeneratedProofFileName(null);
  }, []);

  const downloadProof = useCallback(() => {
    if (!generatedProofBlob || !generatedProofFileName) return;

    const url = URL.createObjectURL(generatedProofBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = generatedProofFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generatedProofBlob, generatedProofFileName]);

  return {
    generateProofWithProgress,
    currentStep,
    isGenerating,
    error,
    reset,
    downloadProof,
    hasGeneratedProof: generatedProofBlob !== null,
  };
}

// Helper function to reconstruct ZIP with new folder structure
async function reconstructZip(
  originalZipBlob: Blob,
  channelId: string,
  proofNumber: number
): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const originalZip = await JSZip.loadAsync(originalZipBlob);

  const newFolderName = `${channelId.toLowerCase()}-proof#${proofNumber}`;

  for (const [filePath, file] of Object.entries(originalZip.files)) {
    if (file.dir) continue;

    const fileName = filePath.split("/").pop() || filePath;

    let targetFolder = "";
    if (
      fileName === "proof.json" ||
      filePath.includes("prove") ||
      filePath.includes("proof")
    ) {
      targetFolder = `${newFolderName}/prove/`;
    } else if (
      fileName === "instance.json" ||
      fileName === "state_snapshot.json" ||
      fileName === "placementVariables.json" ||
      fileName === "instance_description.json" ||
      fileName === "permutation.json" ||
      fileName === "block_info.json" ||
      fileName === "contract_code.json" ||
      fileName === "previous_state_snapshot.json" ||
      filePath.includes("synthesizer")
    ) {
      targetFolder = `${newFolderName}/synthesizer/`;
    } else {
      continue;
    }

    const content = await file.async("uint8array");
    zip.file(`${targetFolder}${fileName}`, content);
  }

  return await zip.generateAsync({ type: "blob" });
}
