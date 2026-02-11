/**
 * Hook for submitting verified proofs to the contract
 *
 * Automatically formats verified proofs from DB and submits them via submitProofAndSignature
 */

import { useState, useCallback, useEffect } from "react";
import {
  formatVerifiedProofsForSubmission,
  loadProofFromFilePath,
  type FormattedProofForSubmission,
} from "../_utils/proofFormatter";
import {
  useBridgeProofManagerWrite,
  useBridgeProofManagerWaitForReceipt,
} from "@/hooks/contract";

export type SubmitProofStep =
  | "idle"
  | "signing"
  | "confirming"
  | "completed"
  | "error";

interface VerifiedProof {
  key: string;
  proofId: string;
  sequenceNumber: number;
  zipFile: {
    filePath: string;
    fileName: string;
    size: number;
  };
  verifiedAt: string | number; // Unix timestamp (number) or ISO string (string) for backward compatibility
  verifiedBy: string;
}

export function useSubmitProof(channelId: string | null) {
  const [isLoadingProofs, setIsLoadingProofs] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formattedProofs, setFormattedProofs] =
    useState<FormattedProofForSubmission | null>(null);
  const [verifiedProofsList, setVerifiedProofsList] = useState<VerifiedProof[]>(
    []
  );
  const [currentStep, setCurrentStep] = useState<SubmitProofStep>("idle");

  // Contract write hook
  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    error: writeError,
  } = useBridgeProofManagerWrite();

  // Wait for transaction receipt
  const {
    isLoading: isWaitingReceipt,
    isSuccess: isTransactionSuccess,
    error: receiptError,
  } = useBridgeProofManagerWaitForReceipt({
    hash: txHash,
    query: {
      enabled: !!txHash,
    },
  });

  /**
   * Load verified proofs from DB and format them for submission
   */
  const loadAndFormatProofs = useCallback(async () => {
    if (!channelId) {
      throw new Error("Channel ID is required");
    }

    setIsLoadingProofs(true);
    setError(null);

    try {
      // Normalize channelId to lowercase for consistent DB lookup
      // (DB stores channelId in lowercase format)
      const normalizedChannelId = channelId.toLowerCase();
      const encodedChannelId = encodeURIComponent(normalizedChannelId);

      // Fetch verified proofs from DB
      const response = await fetch(
        `/api/channels/${encodedChannelId}/proofs?type=verified`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch proofs: HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "No verified proofs available");
      }

      // API returns array directly, but handle both array and object formats
      let proofsArray: VerifiedProof[] = [];
      if (Array.isArray(data.data)) {
        proofsArray = data.data;
      } else if (data.data && typeof data.data === "object") {
        // Convert object to array
        proofsArray = Object.entries(data.data).map(
          ([key, value]: [string, any]) => ({
            key,
            ...value,
          })
        );
      }

      // Sort by sequence number
      proofsArray.sort(
        (a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0)
      );

      if (proofsArray.length === 0) {
        throw new Error("No verified proofs found");
      }

      // Load proof ZIP files
      const proofBlobs: Blob[] = [];
      for (const proof of proofsArray) {
        // Use proof.key directly (same as useProofActions.ts)
        const proofId = proof.key;
        if (!proofId) {
          throw new Error(`Proof has no key: ${JSON.stringify(proof)}`);
        }

        // Use get-proof-zip API with normalized channelId and proofId
        const apiUrl = `/api/get-proof-zip?channelId=${encodeURIComponent(
          normalizedChannelId
        )}&proofId=${encodeURIComponent(
          proofId
        )}&status=verifiedProofs&format=binary`;

        const zipResponse = await fetch(apiUrl);
        if (!zipResponse.ok) {
          // Get error details from response
          let errorDetails = `HTTP ${zipResponse.status}`;
          try {
            const errorData = await zipResponse.json();
            errorDetails = errorData.error || errorData.details || errorDetails;
          } catch {
            // If response is not JSON, use status text
            errorDetails = zipResponse.statusText || errorDetails;
          }
          throw new Error(
            `Failed to load proof file: ${proofId} (${errorDetails})`
          );
        }
        const blob = await zipResponse.blob();
        proofBlobs.push(blob);
      }

      // Format proofs for contract submission
      const formatted = await formatVerifiedProofsForSubmission(
        proofBlobs,
        channelId
      );
      setFormattedProofs(formatted);
      setVerifiedProofsList(proofsArray);

      return formatted;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load proofs";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoadingProofs(false);
    }
  }, [channelId]);

  /**
   * Submit proofs to the contract
   */
  const submitProofs = useCallback(async () => {
    if (!channelId) {
      setError("Channel ID is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Reload and format proofs to ensure fresh bigint values
      // This avoids issues with React state serialization converting bigint to strings
      const freshFormattedProofs = await loadAndFormatProofs();

      if (!freshFormattedProofs) {
        throw new Error("Failed to load proofs");
      }

      // Prepare signature (empty signature for now - can be extended later)
      const signature = {
        message:
          "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        rx: BigInt(0),
        ry: BigInt(0),
        z: BigInt(0),
      };

      // channelId is bytes32, pass as hex string directly
      // Contract expects bytes32, not uint256 (contract was upgraded)
      console.log("=".repeat(80));
      console.log("[useSubmitProof] ChannelId Parsing:");
      console.log("=".repeat(80));
      console.log("Original channelId:", channelId);
      console.log("channelId type:", typeof channelId);
      console.log("channelId startsWith('0x'):", channelId.startsWith("0x"));
      console.log("channelId length:", channelId.length);

      let channelIdBytes32: `0x${string}`;
      if (channelId.startsWith("0x")) {
        // Already hex string - use directly
        channelIdBytes32 = channelId as `0x${string}`;
        console.log("Using channelId as-is (already hex string)");
      } else {
        // Convert numeric string to bytes32 hex format (padded to 32 bytes)
        const bigIntValue = BigInt(channelId);
        const hexValue = bigIntValue.toString(16).padStart(64, "0");
        channelIdBytes32 = `0x${hexValue}` as `0x${string}`;
      }

      // Validate proofs before conversion
      // Contract requirements:
      // 1. proofs.length > 0 && proofs.length <= 5
      // 2. publicInputs.length >= 12 for each proof
      if (freshFormattedProofs.proofData.length === 0) {
        throw new Error("No proofs to submit");
      }
      if (freshFormattedProofs.proofData.length > 5) {
        throw new Error("Cannot submit more than 5 proofs at once");
      }

      // Validate publicInputs length for each proof
      for (let i = 0; i < freshFormattedProofs.proofData.length; i++) {
        const proof = freshFormattedProofs.proofData[i];
        if (proof.publicInputs.length < 12) {
          throw new Error(
            `Proof ${i + 1}: publicInputs length must be at least 12, got ${
              proof.publicInputs.length
            }`
          );
        }
      }

      // Convert proofData to ensure all values are bigint (explicit conversion)
      // viem may serialize bigint to strings, so we need to ensure they're bigint
      const proofDataForContract = freshFormattedProofs.proofData.map(
        (proof) => {
          // Helper function to convert any value to bigint
          const toBigInt = (value: any): bigint => {
            if (typeof value === "bigint") return value;
            if (typeof value === "string") return BigInt(value);
            if (typeof value === "number") return BigInt(value);
            throw new Error(
              `Cannot convert ${typeof value} to bigint: ${value}`
            );
          };

          return {
            proofPart1: proof.proofPart1.map(toBigInt),
            proofPart2: proof.proofPart2.map(toBigInt),
            publicInputs: proof.publicInputs.map(toBigInt),
            smax: toBigInt(proof.smax),
          };
        }
      );

      // Call writeContract - wrap in try-catch to handle synchronous errors
      try {
        // Prepare args for writeContract
        // Contract signature: submitProofAndSignature(bytes32 channelId, ProofData[] calldata proofs, Signature calldata signature)
        const contractArgs = [
          channelIdBytes32, // bytes32 hex string
          proofDataForContract,
          signature,
        ];

        // Detailed logging for submitProofAndSignature parameters
        console.log("=".repeat(80));
        console.log("[submitProofAndSignature] CONTRACT CALL PARAMETERS");
        console.log("=".repeat(80));
        console.log("\n[1] channelId (bytes32):");
        console.log("   ", channelIdBytes32);
        console.log("\n[2] proofs array (length:", proofDataForContract.length, "):");
        proofDataForContract.forEach((proof, idx) => {
          console.log(`\n   --- Proof ${idx + 1} ---`);
          console.log("   proofPart1 (length:", proof.proofPart1.length, "):");
          proof.proofPart1.forEach((v, i) => console.log(`      [${i}]: ${v.toString(16).padStart(64, "0")}`));
          console.log("   proofPart2 (length:", proof.proofPart2.length, "):");
          proof.proofPart2.forEach((v, i) => console.log(`      [${i}]: ${v.toString(16).padStart(64, "0")}`));
          console.log("   publicInputs (length:", proof.publicInputs.length, "):");
          proof.publicInputs.slice(0, 20).forEach((v, i) => console.log(`      [${i}]: ${v.toString(16).padStart(64, "0")}`));
          if (proof.publicInputs.length > 20) {
            console.log(`      ... and ${proof.publicInputs.length - 20} more entries`);
          }
          console.log("   smax:", proof.smax.toString());
        });
        console.log("\n[3] signature:");
        console.log("   message:", signature.message);
        console.log("   rx:", signature.rx.toString());
        console.log("   ry:", signature.ry.toString());
        console.log("   z:", signature.z.toString());
        console.log("=".repeat(80));
        console.log("Full contractArgs object:", contractArgs);
        console.log("=".repeat(80));

        writeContract({
          functionName: "submitProofAndSignature",
          args: contractArgs,
        });
        // Note: setIsSubmitting(false) will be handled by useEffect when writeError occurs
      } catch (syncError) {
        // Handle synchronous errors from writeContract
        const errorMessage =
          syncError instanceof Error
            ? syncError.message
            : "Failed to submit proofs";
        setError(errorMessage);
        setIsSubmitting(false);
        throw syncError;
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to submit proofs";
      setError(errorMessage);
      setIsSubmitting(false);
      throw err;
    }
  }, [channelId, writeContract, loadAndFormatProofs]);

  // Step transitions based on contract hooks
  useEffect(() => {
    // When pending signature, move to signing step
    if (isWritePending && currentStep === "idle") {
      setCurrentStep("signing");
    }
  }, [isWritePending, currentStep]);

  // When txHash is received, user has signed - move to confirming step
  useEffect(() => {
    if (txHash && currentStep === "signing") {
      setCurrentStep("confirming");
    }
  }, [txHash, currentStep]);

  // Handle success
  useEffect(() => {
    if (isTransactionSuccess && currentStep === "confirming") {
      setCurrentStep("completed");
    }
  }, [isTransactionSuccess, currentStep]);

  // Reset submitting state when write error occurs
  useEffect(() => {
    if (writeError || receiptError) {
      setIsSubmitting(false);
      setCurrentStep("error");

      // Log detailed error information
      if (writeError) {
        const errorAny = writeError as any;

        // Extract error details from nested structures

        // Check if this is a network error (not a contract revert)
        // "Failed to fetch" in revert reason usually indicates a network error was misclassified
        const isNetworkError =
          writeError.message.includes("Failed to fetch") ||
          writeError.message.includes("NetworkError") ||
          writeError.message.includes("fetch failed") ||
          errorAny.cause?.code === "NETWORK_ERROR" ||
          (errorAny.cause?.data?.message &&
            errorAny.cause.data.message.includes("Failed to fetch")) ||
          (errorAny.cause?.data?.reason &&
            errorAny.cause.data.reason.includes("Failed to fetch"));

        if (isNetworkError) {
          setError(
            "Network error: Failed to connect to the blockchain. This may be due to:\n" +
              "1. Network connectivity issues\n" +
              "2. RPC endpoint unavailable\n" +
              "3. Request timeout\n\n" +
              "Please check your network connection and try again."
          );
          return;
        }

        // Extract revert reason from multiple possible locations
        // Only extract if it's actually a contract revert, not a network error
        const revertReason =
          errorAny.cause?.data?.message ||
          errorAny.cause?.data?.reason ||
          errorAny.cause?.reason ||
          errorAny.cause?.message ||
          errorAny.cause?.shortMessage ||
          errorAny.reason ||
          errorAny.shortMessage ||
          (writeError.message.includes("revert") &&
          !writeError.message.includes("Failed to fetch")
            ? writeError.message.match(/revert[:\s]+(.+)/i)?.[1]
            : null);

        // Filter out invalid revert reasons (network errors, generic messages)
        const isValidRevertReason =
          revertReason &&
          !revertReason.includes("Internal JSON-RPC error") &&
          !revertReason.includes("Failed to fetch") &&
          !revertReason.includes("NetworkError") &&
          revertReason !== writeError.message &&
          revertReason.length > 0 &&
          revertReason.length < 200; // Reasonable length check

        if (isValidRevertReason) {
          setError(`Contract revert: ${revertReason}`);
        } else if (writeError.message.includes("revert")) {
          // Contract reverted but we couldn't extract a valid reason
          // Provide helpful error message based on common revert reasons
          const commonReasons = [
            "Invalid state - Channel must be in Open state (2)",
            "State root chain broken - Proofs must be in correct order",
            "Invalid public inputs length - Each proof must have at least 12 public inputs",
            "Invalid group threshold signature - Signature verification failed",
            "Signature must commit to proof content",
          ];

          setError(
            "Contract execution reverted. Common reasons:\n" +
              commonReasons.map((r, i) => `${i + 1}. ${r}`).join("\n") +
              "\n\nPlease check the console for detailed error information."
          );
        } else {
          // Generic error
          setError(
            `Contract execution failed: ${writeError.message}\n\n` +
              "Please check:\n" +
              "1. Channel state is Open (2)\n" +
              "2. Proofs are in correct order with valid state root chain\n" +
              "3. publicInputs length >= 12 for each proof\n" +
              "4. Network connection is stable"
          );
        }
      }
    }
  }, [writeError, receiptError]);

  // Update submitting state based on transaction status
  const isSubmittingTransaction =
    isWritePending || isWaitingReceipt || isSubmitting;

  // Update error state
  const transactionError = writeError || receiptError;

  // Reset function
  const reset = useCallback(() => {
    setError(null);
    setIsSubmitting(false);
    setCurrentStep("idle");
  }, []);

  return {
    loadAndFormatProofs,
    submitProofs,
    isLoadingProofs,
    isSubmitting: isSubmittingTransaction,
    isTransactionSuccess,
    error: error || (transactionError ? transactionError.message : null),
    formattedProofs,
    verifiedProofsList,
    txHash,
    currentStep,
    reset,
  };
}
