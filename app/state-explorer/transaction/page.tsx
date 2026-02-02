/**
 * Transaction Component
 *
 * Component for creating and viewing transactions
 * Shows when channel is active (initialized)
 *
 * Design:
 * - https://www.figma.com/design/0R11fVZOkNSTJjhTKvUjc7/Ooo?node-id=3138-232280
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { HelpCircle } from "lucide-react";
import { useChannelFlowStore } from "@/stores/useChannelFlowStore";
import { usePreviousStateSnapshot } from "@/app/state-explorer/_hooks/usePreviousStateSnapshot";
import { L2_PRV_KEY_MESSAGE } from "@/lib/l2KeyMessage";
import { addHexPrefix } from "@ethereumjs/util";
import { parseUnits } from "viem";
import { ProofList } from "./_components/ProofList";
import { ProofGenerationModal, type ProofGenerationStep } from "./_components/ProofGenerationModal";
import { Button, AmountInput } from "@/components/ui";
import { useBridgeCoreRead } from "@/hooks/contract";
import { useChannelUserBalance } from "@/hooks/useChannelUserBalance";
import { useToken } from "../_context";

function TransactionPage() {
  const { tokenSymbol, tokenDecimals } = useToken();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { currentChannelId } = useChannelFlowStore();

  // Get channel leader
  const { data: channelLeader } = useBridgeCoreRead({
    functionName: "getChannelLeader",
    args: currentChannelId ? [currentChannelId as `0x${string}`] : undefined,
    query: {
      enabled: !!currentChannelId && !!address,
    },
  });

  // Check if current user is leader
  const isLeader =
    channelLeader && address
      ? String(channelLeader).toLowerCase() === String(address).toLowerCase()
      : false;

  // Get user's registered MPT key from on-chain (already deposited/registered)
  const { data: registeredMptKey } = useBridgeCoreRead({
    functionName: "getL2MptKey",
    args: currentChannelId && address
      ? [currentChannelId as `0x${string}`, address]
      : undefined,
    query: {
      enabled: !!currentChannelId && !!address,
    },
  });

  // Convert MPT key bigint to hex string
  const mptKeyHex = registeredMptKey
    ? `0x${(registeredMptKey as bigint).toString(16).padStart(64, "0")}`
    : null;

  // Get user's channel balance (from verified proof or initial deposit)
  const { balance: userBalance, balanceFormatted: userBalanceFormatted } = useChannelUserBalance({
    channelId: currentChannelId || null,
    mptKey: mptKeyHex,
  });

  // Form state
  const [recipient, setRecipient] = useState<`0x${string}` | null>(null);
  const [tokenAmount, setTokenAmount] = useState<string>("");

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [proofListRefreshKey, setProofListRefreshKey] = useState(0);
  const [showProofModal, setShowProofModal] = useState(false);
  const [currentProofStep, setCurrentProofStep] = useState<ProofGenerationStep>("idle");

  // Ref to store keySeed for proof generation
  const keySeedRef = useRef<`0x${string}` | null>(null);

  // State for storing generated proof for optional download
  const [generatedProofBlob, setGeneratedProofBlob] = useState<Blob | null>(null);
  const [generatedProofFileName, setGeneratedProofFileName] = useState<string | null>(null);

  // Proof actions from ProofList
  const [proofActions, setProofActions] = useState<{
    downloadAllApproved: () => void;
    openUploadModal: () => void;
    openSubmitProofModal: () => void;
    isDownloadingAllApproved: boolean;
    approvedProofsCount: number;
    isLoadingProofs: boolean;
    isSubmitting: boolean;
  } | null>(null);

  // Hook to fetch previous state snapshot
  const { fetchSnapshot } = usePreviousStateSnapshot({
    channelId: currentChannelId || null,
    bundleSnapshot: null,
  });

  // Open modal to start the proof generation flow
  const handleOpenProofModal = () => {
    if (!isConnected || !address) {
      setError("Please connect your wallet first");
      return;
    }

    if (!currentChannelId) {
      setError("Please select a channel first");
      return;
    }

    if (!recipient || !tokenAmount) {
      setError("Please fill in all fields");
      return;
    }

    setError(null);
    setShowProofModal(true);
  };

  // Sign with MetaMask (called from modal)
  const handleSign = useCallback(async (): Promise<`0x${string}`> => {
    if (!currentChannelId) {
      throw new Error("No channel selected");
    }

    const message = L2_PRV_KEY_MESSAGE + currentChannelId;
    const seed = await signMessageAsync({ message });
    keySeedRef.current = seed;
    return seed;
  }, [currentChannelId, signMessageAsync]);

  // Handle proof generation with SSE progress tracking (called from modal)
  const handleGenerateProof = useCallback(async (keySeed: `0x${string}`) => {
    if (!currentChannelId || !address || !recipient || !tokenAmount) {
      throw new Error("Missing required parameters");
    }

    // Get initialization tx hash
    const normalizedChannelId = currentChannelId.toLowerCase();
    const encodedChannelId = encodeURIComponent(normalizedChannelId);
    
    const channelResponse = await fetch(`/api/channels/${encodedChannelId}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    const channelData = await channelResponse.json();
    const initTxHash = channelData.data?.initializationTxHash;

    if (!initTxHash) {
      throw new Error("Could not find initialization transaction hash");
    }

    // Fetch previous state snapshot
    const previousStateSnapshot = await fetchSnapshot();
    if (!previousStateSnapshot) {
      throw new Error("Could not find previous state snapshot");
    }

    // Import required modules
    const { createERC20TransferTx } = await import("@/lib/createERC20TransferTx");
    const { bytesToHex } = await import("@ethereumjs/util");
    const { TON_TOKEN_ADDRESS } = await import("@tokamak/config");
    const { parseInputAmount } = await import("@/lib/utils/format");
    const JSZip = (await import("jszip")).default;

    // Create signed L2 transaction
    const amountInWei = parseInputAmount(tokenAmount.trim(), 18);
    const signedTx = await createERC20TransferTx(
      0,
      recipient,
      amountInWei,
      keySeed,
      TON_TOKEN_ADDRESS
    );
    const signedTxStr = bytesToHex(signedTx.serialize());

    // Make SSE request for proof generation with progress
    const response = await fetch("/api/tokamak-zk-evm/synthesize-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: normalizedChannelId,
        channelInitTxHash: initTxHash,
        signedTxRlpStr: signedTxStr,
        previousStateSnapshot,
      }),
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

    // Read SSE stream
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
            setCurrentProofStep(data.step);

            if (data.step === "error") {
              throw new Error(data.error || "Proof generation failed");
            }

            if (data.step === "completed" && data.zipBase64) {
              zipBase64 = data.zipBase64;
            }
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message.includes("Proof generation failed")) {
              throw parseError;
            }
            console.warn("Failed to parse SSE event:", parseError);
          }
        }
      }
    }

    if (!zipBase64) {
      throw new Error("No proof data received");
    }

    // Convert base64 to blob
    const zipBuffer = Uint8Array.from(atob(zipBase64), (c) => c.charCodeAt(0));
    const zipBlob = new Blob([zipBuffer], { type: "application/zip" });

    // Get next proof number
    const proofNumberResponse = await fetch("/api/get-next-proof-number", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: normalizedChannelId }),
    });

    if (!proofNumberResponse.ok) {
      throw new Error("Failed to get next proof number");
    }

    const { proofNumber, subNumber, proofId, storageProofId } =
      await proofNumberResponse.json();

    // Reconstruct ZIP with new folder structure
    const zip = new JSZip();
    const originalZip = await JSZip.loadAsync(zipBlob);
    const newFolderName = `${normalizedChannelId}-proof#${proofNumber}`;

    for (const [filePath, file] of Object.entries(originalZip.files)) {
      if (file.dir) continue;
      const fileName = filePath.split("/").pop() || filePath;

      let targetFolder = "";
      if (fileName === "proof.json" || filePath.includes("prove") || filePath.includes("proof")) {
        targetFolder = `${newFolderName}/prove/`;
      } else if (
        ["instance.json", "state_snapshot.json", "placementVariables.json", 
         "instance_description.json", "permutation.json", "block_info.json",
         "contract_code.json", "previous_state_snapshot.json"].includes(fileName) ||
        filePath.includes("synthesizer")
      ) {
        targetFolder = `${newFolderName}/synthesizer/`;
      } else {
        continue;
      }

      const content = await file.async("uint8array");
      zip.file(`${targetFolder}${fileName}`, content);
    }

    const reconstructedZipBlob = await zip.generateAsync({ type: "blob" });

    // Upload to storage
    const formData = new FormData();
    formData.append(
      "file",
      new File([reconstructedZipBlob], `proof-${proofId}.zip`, { type: "application/zip" })
    );
    formData.append("channelId", normalizedChannelId);
    formData.append("proofId", storageProofId);

    const uploadResponse = await fetch("/api/save-proof-zip", {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload proof");
    }

    // Save proof metadata to DB
    const metadataPayload = {
      proofId,
      sequenceNumber: proofNumber,
      subNumber,
      submittedAt: Date.now(),
      submitter: address,
      timestamp: Date.now(),
      uploadStatus: "complete",
      status: "pending",
      channelId: normalizedChannelId,
    };

    console.log("[handleGenerateProof] Saving proof metadata:", {
      path: `channels.${normalizedChannelId}.submittedProofs.${storageProofId}`,
      data: metadataPayload,
    });

    const metadataResponse = await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: `channels.${normalizedChannelId}.submittedProofs.${storageProofId}`,
        data: metadataPayload,
        operation: "update",
      }),
    });

    if (!metadataResponse.ok) {
      const errorData = await metadataResponse.json().catch(() => ({}));
      console.error("[handleGenerateProof] Failed to save metadata:", errorData);
      throw new Error("Failed to save proof metadata to database");
    }

    const metadataResult = await metadataResponse.json();
    console.log("[handleGenerateProof] Metadata saved successfully:", metadataResult);

    // Store the ZIP blob for optional download
    setGeneratedProofBlob(reconstructedZipBlob);
    setGeneratedProofFileName(`l2-transaction-channel-${currentChannelId}.zip`);

    // Refresh proof list
    setProofListRefreshKey((prev) => prev + 1);
  }, [currentChannelId, address, recipient, tokenAmount, fetchSnapshot]);

  // Handle proof download
  const handleDownloadProof = useCallback(() => {
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

  // Handle modal close
  const handleModalClose = () => {
    setShowProofModal(false);
    setCurrentProofStep("idle");
    keySeedRef.current = null;
    // Reset form
    setRecipient(null);
    setTokenAmount("");
    // Reset proof download state
    setGeneratedProofBlob(null);
    setGeneratedProofFileName(null);
  };

  // Validation checks
  const hasRecipient = Boolean(recipient && recipient.trim() !== "");
  const hasAmount = Boolean(tokenAmount && parseFloat(tokenAmount) > 0);
  
  const parsedAmount = tokenAmount && parseFloat(tokenAmount) > 0
    ? parseUnits(tokenAmount, tokenDecimals)
    : BigInt(0);
  
  // Check if amount exceeds balance
  const exceedsBalance = userBalance !== null && parsedAmount > userBalance;
  
  // All conditions met
  const isFormValid = hasRecipient && hasAmount && !exceedsBalance;
  
  // Button text based on validation state
  const getButtonText = () => {
    if (!hasRecipient) return "Enter L2 Address";
    if (!hasAmount) return "Enter Amount";
    if (exceedsBalance) return "Insufficient Balance";
    return "Create Transaction";
  };

  return (
    <div className="font-mono" style={{ width: 544 }}>
      {/* Transaction Section */}
      <div className="flex flex-col gap-6">
        {/* Title */}
        <h2
          className="font-medium text-[#111111]"
          style={{ fontSize: 32, lineHeight: "1.3em" }}
        >
          Transaction
        </h2>

        {/* Recipient L2 Address */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <label
              className="font-medium text-[#111111]"
              style={{ fontSize: 18, lineHeight: "1.3em" }}
            >
              Recipient L2 Address
            </label>
            <div className="relative group">
              <HelpCircle className="w-5 h-5 text-[#999999] cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-[#333333] text-white text-sm rounded-md whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                L2 Address is derived from your wallet address and channel ID.
                <br />
                You can calculate it in the Account Panel.
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[#333333]" />
              </div>
            </div>
          </div>
          <input
            type="text"
            placeholder="Enter Recipient L2 Address"
            value={recipient ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "") {
                setRecipient(null);
              } else if (value.startsWith("0x")) {
                setRecipient(value as `0x${string}`);
              } else {
                setRecipient(addHexPrefix(value) as `0x${string}`);
              }
            }}
            data-testid="recipient-address-input"
            className="w-full px-4 py-3.5 border border-[#BBBBBB] rounded text-lg font-mono"
            style={{
              fontSize: 18,
              color: recipient ? "#111111" : "#999999",
            }}
          />
        </div>

        {/* Amount */}
        <AmountInput
          label="Amount"
          value={tokenAmount}
          onChange={setTokenAmount}
          balance={userBalanceFormatted}
          tokenSymbol={tokenSymbol}
          onMaxClick={() => setTokenAmount(userBalanceFormatted)}
          error={exceedsBalance}
          testId="transfer-amount-input"
        />

        {/* Create Transaction Button - Opens proof generation modal */}
        <Button
          variant="primary"
          size="full"
          onClick={handleOpenProofModal}
          disabled={!isConnected || !isFormValid}
          testId="create-transaction-button"
        >
          {getButtonText()}
        </Button>
      </div>

      {/* Proofs Section */}
      <div className="mt-12">
        {/* Header: Title + Submit Proof Button (Leader only) */}
        <div className="flex items-center justify-between mb-6">
          <h2
            className="font-medium text-[#111111]"
            style={{ fontSize: 32, lineHeight: "1.3em" }}
          >
            Proofs
          </h2>
          {isLeader && (() => {
            const isDisabled = !proofActions || proofActions.approvedProofsCount === 0 || proofActions.isLoadingProofs || proofActions.isSubmitting;
            return (
              <button
                type="button"
                onClick={() => proofActions?.openSubmitProofModal()}
                disabled={isDisabled}
                data-testid="submit-proof-button"
                className="flex items-center justify-center font-mono font-medium transition-colors disabled:cursor-not-allowed"
                style={{
                  height: 40,
                  padding: "16px 24px",
                  borderRadius: 4,
                  border: "1px solid #111111",
                  backgroundColor: isDisabled ? "#999999" : "#2A72E5",
                  color: isDisabled ? "#DCDCDC" : "#FFFFFF",
                  fontSize: 18,
                }}
              >
                {proofActions?.isLoadingProofs
                  ? "Loading..."
                  : proofActions?.isSubmitting
                  ? "Submitting..."
                  : "Submit Proof"}
              </button>
            );
          })()}
        </div>

        <ProofList 
          key={proofListRefreshKey}
          onActionsReady={setProofActions}
        />
      </div>

      {/* Proof Generation Modal */}
      {currentChannelId && (
        <ProofGenerationModal
          isOpen={showProofModal}
          onClose={handleModalClose}
          onSign={handleSign}
          onGenerateProof={handleGenerateProof}
          channelId={currentChannelId}
          recipient={recipient || ""}
          amount={tokenAmount}
          tokenSymbol={tokenSymbol}
          currentStep={currentProofStep}
          onStepChange={setCurrentProofStep}
          onDownload={generatedProofBlob ? handleDownloadProof : undefined}
        />
      )}
    </div>
  );
}

export default TransactionPage;
