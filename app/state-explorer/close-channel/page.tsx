"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Button, Card } from "@tokamak/ui";
import {
  AlertCircle,
  CheckCircle,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronRight,
  FileText,
} from "lucide-react";
import { useChannelInfo } from "@/hooks/useChannelInfo";
import { useSubmitProof } from "../_hooks/useSubmitProof";
import { useCloseChannel } from "../_hooks/useCloseChannel";
import { useBridgeCoreRead, useBridgeProofManagerRead } from "@/hooks/contract";
import { generateClientSideProof } from "@/lib/clientProofGeneration";
import { keccak256, encodePacked } from "viem";
import { CloseChannelConfirmModal, type CloseChannelModalStep } from "./_components/CloseChannelConfirmModal";

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

export default function CloseChannelPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const channelIdParam = searchParams?.get("channelId");
  const channelId = channelIdParam && channelIdParam.startsWith("0x") 
    ? (channelIdParam as `0x${string}`) 
    : null;

  const channelInfo = useChannelInfo(channelId);

  // Get channel leader to determine if current user is leader
  const { data: channelLeader } = useBridgeCoreRead({
    functionName: "getChannelLeader",
    args: channelId ? [channelId as `0x${string}`] : undefined,
    query: {
      enabled: !!channelId && isConnected,
    },
  });

  const isLeader = useMemo(() => {
    if (!channelLeader || !address) return false;
    return String(channelLeader).toLowerCase() === String(address).toLowerCase();
  }, [channelLeader, address]);

  // Phase state: 1 = Submit Proof, 2 = Verify Final Balances
  const [phase, setPhase] = useState<1 | 2>(1);
  const [verifiedProofs, setVerifiedProofs] = useState<VerifiedProof[]>([]);
  const [isLoadingProofs, setIsLoadingProofs] = useState(true);
  const [proofsError, setProofsError] = useState("");

  // Phase 1 states - use useSubmitProof hook
  const {
    loadAndFormatProofs,
    submitProofs,
    isLoadingProofs: isSubmittingProof,
    isSubmitting: isSubmittingTransaction,
    isTransactionSuccess: submitProofSuccess,
    error: submitProofError,
    currentStep: submitProofStep,
  } = useSubmitProof(channelId);

  // Phase 2 states
  const [isGeneratingFinalProof, setIsGeneratingFinalProof] = useState(false);
  const [finalProofStatus, setFinalProofStatus] = useState("");
  const [isClosingChannel, setIsClosingChannel] = useState(false);
  const [closeChannelError, setCloseChannelError] = useState("");
  const [finalBalances, setFinalBalances] = useState<bigint[]>([]);
  const [permutation, setPermutation] = useState<bigint[]>([]);
  const [groth16Proof, setGroth16Proof] = useState<{
    pA: [bigint, bigint, bigint, bigint];
    pB: [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
    pC: [bigint, bigint, bigint, bigint];
  } | null>(null);

  // Modal state for Phase 2
  const [showCloseChannelModal, setShowCloseChannelModal] = useState(false);
  const [closeChannelModalStep, setCloseChannelModalStep] = useState<CloseChannelModalStep>("idle");

  // Get channel data for Phase 2
  const { data: channelParticipantsRaw } = useBridgeCoreRead({
    functionName: "getChannelParticipants",
    args: channelId ? [channelId as `0x${string}`] : undefined,
    query: {
      enabled: !!channelId && isConnected && phase === 2,
    },
  });
  // Cast to proper array type
  const channelParticipants = channelParticipantsRaw as `0x${string}`[] | undefined;

  const { data: channelTreeSize } = useBridgeCoreRead({
    functionName: "getChannelTreeSize",
    args: channelId ? [channelId as `0x${string}`] : undefined,
    query: {
      enabled: !!channelId && isConnected && phase === 2,
    },
  });

  const { data: finalStateRoot } = useBridgeCoreRead({
    functionName: "getChannelFinalStateRoot",
    args: channelId ? [channelId as `0x${string}`] : undefined,
    query: {
      enabled: !!channelId && isConnected && phase === 2,
    },
  });

  const { data: channelTargetContract } = useBridgeCoreRead({
    functionName: "getChannelTargetContract",
    args: channelId ? [channelId as `0x${string}`] : undefined,
    query: {
      enabled: !!channelId && isConnected && phase === 2,
    },
  });

  const { data: preAllocatedKeys } = useBridgeCoreRead({
    functionName: "getPreAllocatedKeys",
    args: channelTargetContract ? [channelTargetContract as `0x${string}`] : undefined,
    query: {
      enabled: !!channelTargetContract && isConnected && phase === 2,
    },
  });

  // Get channel's pre-allocated leaves count (per-channel, NOT per-target-contract)
  const { data: channelPreAllocCountData } = useBridgeCoreRead({
    functionName: "getChannelPreAllocatedLeavesCount",
    args: channelId ? [channelId as `0x${string}`] : undefined,
    query: {
      enabled: !!channelId && isConnected && phase === 2,
    },
  });
  const channelPreAllocCount = channelPreAllocCountData ? Number(channelPreAllocCountData) : 0;

  // useCloseChannel hook
  const {
    closeChannel,
    isProcessing: isClosingChannelProcessing,
    closeSuccess,
    error: closeChannelHookError,
    currentStep: closeChannelStep,
  } = useCloseChannel({
    channelId: channelId as `0x${string}` | null,
    finalBalances: finalBalances.length > 0 ? finalBalances : undefined,
    permutation: permutation.length > 0 ? permutation : undefined,
    proof: groth16Proof || undefined,
  });

  // Step definitions for inline progress display
  const TRANSACTION_STEPS = [
    { key: "signing", label: "Signing Transaction" },
    { key: "confirming", label: "Confirming Transaction" },
  ] as const;

  // Fetch verified proofs from DB - extracted as callback for reuse
  const fetchVerifiedProofs = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    
    if (!channelId) return;

    try {
      if (!silent) setIsLoadingProofs(true);
      const response = await fetch(
        `/api/channels/${channelId}/proofs?type=verified${silent ? "&silent=true" : ""}`
      );
      const data = await response.json();

      if (data.success && data.data) {
        let proofsArray: VerifiedProof[] = [];
        if (Array.isArray(data.data)) {
          proofsArray = data.data;
        } else if (data.data && typeof data.data === "object") {
          proofsArray = Object.entries(data.data).map(
            ([key, value]: [string, any]) => ({
              key,
              ...value,
            })
          );
        }
        // Sort by sequence number descending (most recent first)
        proofsArray.sort((a, b) => b.sequenceNumber - a.sequenceNumber);
        setVerifiedProofs(proofsArray);
      }
    } catch (error) {
      console.error("Error fetching verified proofs:", error);
      if (!silent) setProofsError("Failed to load verified proofs");
    } finally {
      if (!silent) setIsLoadingProofs(false);
    }
  }, [channelId]);

  // Initial load of verified proofs
  useEffect(() => {
    if (channelId) {
      fetchVerifiedProofs();
    }
  }, [channelId, fetchVerifiedProofs]);

  // Poll for verified proofs updates every 5 seconds (silent mode)
  useEffect(() => {
    if (!channelId) return;

    const intervalId = setInterval(() => {
      fetchVerifiedProofs({ silent: true });
    }, 5000);

    return () => clearInterval(intervalId);
  }, [channelId, fetchVerifiedProofs]);

  // Check if user is leader
  useEffect(() => {
    if (!isLeader && channelInfo) {
      router.push(`/state-explorer?channelId=${channelId}`);
    }
  }, [isLeader, channelInfo, channelId, router]);

  // Get the most recent proof for submission
  const selectedProof = useMemo(() => {
    return verifiedProofs.length > 0 ? verifiedProofs[0] : null;
  }, [verifiedProofs]);

  // Move to Phase 2 when proof submission succeeds
  useEffect(() => {
    if (submitProofSuccess && phase === 1) {
      setTimeout(() => {
        setPhase(2);
      }, 1500);
    }
  }, [submitProofSuccess, phase]);

  // Phase 1: Submit Proof to move channel from Open to Closing
  const handleSubmitProof = useCallback(async () => {
    if (!selectedProof) {
      return;
    }

    try {
      await submitProofs();
    } catch (error) {
      console.error("Error submitting proof:", error);
    }
  }, [selectedProof, submitProofs]);

  // Phase 2: Build permutation array and final balances
  const buildPermutation = useCallback(async () => {
    if (!channelParticipants || !finalStateRoot || !channelTargetContract) {
      throw new Error("Missing channel data");
    }

    setFinalProofStatus("Fetching final state snapshot from verified proof...");

    // Get the latest state snapshot from verified proofs
    const response = await fetch(
      `/api/get-latest-state-snapshot?channelId=${channelId}`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch latest state snapshot");
    }
    const snapshotResponse = await response.json();

    if (!snapshotResponse.success || !snapshotResponse.snapshot) {
      throw new Error("No verified state snapshot found for this channel");
    }

    const snapshot = snapshotResponse.snapshot;
    console.log("[buildPermutation] State snapshot:", {
      stateRoot: snapshot.stateRoot,
      storageEntriesCount: snapshot.storageEntries?.length || 0,
      registeredKeysCount: snapshot.registeredKeys?.length || 0,
    });

    setFinalProofStatus("Calculating permutation and final balances...");

    // Get registered keys from contract (already fetched via hook)
    // IMPORTANT: Only include pre-allocated keys if channelPreAllocCount > 0 (per-channel)
    // A channel with preAllocCount=0 should NOT include pre-allocated keys
    let registeredKeys: string[] = [];
    if (channelPreAllocCount > 0) {
      if (!preAllocatedKeys || !Array.isArray(preAllocatedKeys)) {
        throw new Error("Failed to fetch registered keys from contract");
      }
      registeredKeys = preAllocatedKeys as string[];
    }

    // Normalize storage key to hex format for comparison
    const normalizeKey = (key: string | bigint): string => {
      if (typeof key === "bigint") {
        return `0x${key.toString(16).padStart(64, "0")}`.toLowerCase();
      }
      const keyStr = key.toString();
      if (keyStr.startsWith("0x")) {
        return keyStr.toLowerCase();
      }
      // If it's a decimal string, convert to hex
      try {
        const bigIntKey = BigInt(keyStr);
        return `0x${bigIntKey.toString(16).padStart(64, "0")}`.toLowerCase();
      } catch {
        return `0x${keyStr}`.toLowerCase();
      }
    };

    // Build value map from snapshot storage entries
    const valuesByKey = new Map<string, string>();
    const storageEntries = snapshot.storageEntries || [];
    storageEntries.forEach((entry: { key: string; value: string }) => {
      const normalizedKey = normalizeKey(entry.key);
      valuesByKey.set(normalizedKey, entry.value);
      console.log(`[buildPermutation] Storage entry: ${normalizedKey} = ${entry.value}`);
    });

    // Build permutation: map registered keys to their indices in the snapshot
    const perm: bigint[] = [];
    for (let i = 0; i < registeredKeys.length; i++) {
      const registeredKey = normalizeKey(registeredKeys[i]);
      let foundIndex = -1;

      // Find index in snapshot storage entries
      for (let j = 0; j < storageEntries.length; j++) {
        const snapshotKey = normalizeKey(storageEntries[j].key);
        if (snapshotKey === registeredKey) {
          foundIndex = j;
          break;
        }
      }

      if (foundIndex === -1) {
        // Key not found in snapshot, use 0
        console.warn(`[buildPermutation] Key ${registeredKey} not found in snapshot, using index 0`);
        perm.push(BigInt(0));
      } else {
        perm.push(BigInt(foundIndex));
      }
    }

    setPermutation(perm);
    console.log("[buildPermutation] Permutation:", perm.map(p => p.toString()));

    // Build final balances: fetch all L2 MPT keys in parallel for efficiency
    setFinalProofStatus("Fetching balance slot index...");

    // Get balance slot index from target contract
    let balanceSlotIndex = 0;
    if (channelTargetContract) {
      try {
        const slotIndexResponse = await fetch(
          `/api/get-balance-slot-index?targetContract=${channelTargetContract}`
        );
        if (slotIndexResponse.ok) {
          const slotIndexData = await slotIndexResponse.json();
          if (slotIndexData.success) {
            balanceSlotIndex = slotIndexData.slotIndex;
            console.log("[buildPermutation] Balance slot index:", balanceSlotIndex);
          }
        }
      } catch (e) {
        console.warn("[buildPermutation] Failed to fetch balance slot index, using default 0");
      }
    }

    setFinalProofStatus("Fetching participant L2 keys...");

    // Fetch all L2 MPT keys in parallel using dynamic balance slot index
    const l2KeyPromises = channelParticipants.map((participant) =>
      fetch(`/api/get-l2-mpt-key?channelId=${channelId}&participant=${participant}&slotIndex=${balanceSlotIndex}`)
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
    );

    const l2KeyResults = await Promise.all(l2KeyPromises);

    // Build balances array by matching L2 keys to storage entries
    const balances: bigint[] = [];
    for (let i = 0; i < channelParticipants.length; i++) {
      const participant = channelParticipants[i];
      const l2KeyData = l2KeyResults[i];
      let participantBalance = BigInt(0);

      if (l2KeyData?.success && l2KeyData?.l2MptKey) {
        const l2MptKey = normalizeKey(l2KeyData.l2MptKey);
        const balanceStr = valuesByKey.get(l2MptKey);
        if (balanceStr) {
          participantBalance = BigInt(balanceStr);
          console.log(`[buildPermutation] Participant ${i} (${participant}): L2Key=${l2MptKey}, balance=${balanceStr}`);
        } else {
          // Debug: log all keys in the map
          console.warn(`[buildPermutation] No balance found for participant ${i} L2Key ${l2MptKey}`);
          console.warn(`[buildPermutation] Available keys:`, Array.from(valuesByKey.keys()));
        }
      } else {
        console.warn(`[buildPermutation] Failed to get L2 key for participant ${i} (${participant})`);
      }

      balances.push(participantBalance);
    }

    setFinalBalances(balances);
    console.log("[buildPermutation] Final balances:", balances.map(b => b.toString()));

    return { permutation: perm, finalBalances: balances, snapshot };
  }, [
    channelId,
    channelParticipants,
    finalStateRoot,
    channelTargetContract,
    preAllocatedKeys,
    channelPreAllocCount,
  ]);

  // Phase 2: Generate Groth16 proof
  const generateGroth16ProofForClose = useCallback(async () => {
    if (!channelTreeSize || !finalStateRoot || !channelTargetContract) {
      throw new Error("Missing channel data");
    }

    setFinalProofStatus("Preparing circuit input from state snapshot...");

    // Get the latest state snapshot from verified proofs (same as buildPermutation)
    const response = await fetch(
      `/api/get-latest-state-snapshot?channelId=${channelId}`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch latest state snapshot");
    }
    const snapshotResponse = await response.json();

    if (!snapshotResponse.success || !snapshotResponse.snapshot) {
      throw new Error("No verified state snapshot found for this channel");
    }

    const snapshot = snapshotResponse.snapshot;
    const storageEntries = snapshot.storageEntries || [];

    console.log("[generateGroth16ProofForClose] State snapshot:", {
      stateRoot: snapshot.stateRoot,
      storageEntriesCount: storageEntries.length,
    });

    const treeSize = Number(channelTreeSize);
    if (![16, 32, 64, 128].includes(treeSize)) {
      throw new Error(`Unsupported tree size: ${treeSize}`);
    }

    // R_MOD constant from BridgeProofManager contract
    const R_MOD = BigInt(
      "0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001"
    );

    // Build storage keys and values arrays from the state snapshot
    // The snapshot storageEntries should already be in the correct order
    const storageKeys: string[] = [];
    const storageValues: string[] = [];

    for (let i = 0; i < storageEntries.length && i < treeSize; i++) {
      const entry = storageEntries[i];
      // Convert key to BigInt, mod by R_MOD, then to string
      const keyBigInt = BigInt(entry.key);
      const modedKey = (keyBigInt % R_MOD).toString();

      // Convert value to BigInt, mod by R_MOD, then to string
      const valueBigInt = BigInt(entry.value);
      const modedValue = (valueBigInt % R_MOD).toString();

      storageKeys.push(modedKey);
      storageValues.push(modedValue);

      console.log(`[generateGroth16ProofForClose] Entry ${i}: key=${entry.key} -> ${modedKey}, value=${entry.value} -> ${modedValue}`);
    }

    // Pad to tree size if needed
    while (storageKeys.length < treeSize) {
      storageKeys.push("0");
      storageValues.push("0");
    }

    console.log("[generateGroth16ProofForClose] Circuit input prepared:", {
      treeSize,
      keysCount: storageKeys.length,
      valuesCount: storageValues.length,
    });

    setFinalProofStatus(
      "Generating Groth16 proof... This may take a few minutes..."
    );

    // Generate proof
    const proofResult = await generateClientSideProof(
      {
        storage_keys_L2MPT: storageKeys,
        storage_values: storageValues,
        treeSize,
      },
      (status) => setFinalProofStatus(status)
    );

    setGroth16Proof({
      pA: [...proofResult.proof.pA] as [bigint, bigint, bigint, bigint],
      pB: [...proofResult.proof.pB] as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
      pC: [...proofResult.proof.pC] as [bigint, bigint, bigint, bigint],
    });

    return proofResult;
  }, [
    channelId,
    channelTreeSize,
    finalStateRoot,
    channelTargetContract,
    preAllocatedKeys,
  ]);

  // Open modal to start Phase 2
  const handleOpenCloseChannelModal = useCallback(() => {
    setCloseChannelModalStep("idle");
    setShowCloseChannelModal(true);
  }, []);

  // Phase 2: Verify final balances and close channel (called from modal)
  const handleVerifyAndClose = useCallback(async () => {
    setIsClosingChannel(true);
    setCloseChannelError("");
    setCloseChannelModalStep("preparing");
    setFinalProofStatus("Preparing final state data...");

    try {
      // Step 1: Build permutation and final balances
      const { permutation: perm, finalBalances: balances } = await buildPermutation();
      console.log("[handleVerifyAndClose] buildPermutation completed:", {
        permutationLength: perm.length,
        balancesLength: balances.length,
        balances: balances.map(b => b.toString()),
      });

      // Step 2: Generate Groth16 proof
      setCloseChannelModalStep("generating_proof");
      const proofResult = await generateGroth16ProofForClose();
      console.log("[handleVerifyAndClose] generateGroth16ProofForClose completed");

      // Get the proof from state since generateGroth16ProofForClose sets it there
      // But due to React batching, we need to use the returned value
      const proof = {
        pA: [...proofResult.proof.pA] as [bigint, bigint, bigint, bigint],
        pB: [...proofResult.proof.pB] as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
        pC: [...proofResult.proof.pC] as [bigint, bigint, bigint, bigint],
      };

      // Step 3: Sign and submit transaction
      // Pass values directly to avoid React state timing issues
      setCloseChannelModalStep("signing");
      setFinalProofStatus("Submitting to blockchain...");
      console.log("[handleVerifyAndClose] Calling closeChannel with:", {
        finalBalances: balances.map(b => b.toString()),
        permutation: perm.map(p => p.toString()),
        proofProvided: !!proof,
      });
      await closeChannel({
        finalBalances: balances,
        permutation: perm,
        proof,
      });

      // Note: confirming step will be set by useCloseChannel hook
      // Success - redirect to withdraw after a delay
      setCloseChannelModalStep("completed");
      setTimeout(() => {
        router.push(`/state-explorer?channelId=${channelId}`);
      }, 2000);
    } catch (error) {
      console.error("Error closing channel:", error);
      setCloseChannelModalStep("error");
      setCloseChannelError(
        error instanceof Error ? error.message : "Failed to close channel"
      );
      throw error; // Re-throw so modal can catch it
    } finally {
      setIsClosingChannel(false);
      setFinalProofStatus("");
    }
  }, [
    buildPermutation,
    generateGroth16ProofForClose,
    closeChannel,
    channelId,
    router,
  ]);

  // Handle modal close
  const handleCloseChannelModalClose = useCallback(() => {
    // Allow closing in error or completed states regardless of processing state
    const canCloseByState = closeChannelModalStep === "error" || closeChannelModalStep === "completed";
    const canCloseByProcessing = !isClosingChannel && !isClosingChannelProcessing;

    if (canCloseByState || canCloseByProcessing) {
      setShowCloseChannelModal(false);
      setCloseChannelModalStep("idle");
      // Reset error state when closing
      setCloseChannelError("");
    }
  }, [isClosingChannel, isClosingChannelProcessing, closeChannelModalStep]);

  // Update modal step based on close channel hook step
  useEffect(() => {
    if (closeChannelStep === "signing" && closeChannelModalStep === "generating_proof") {
      setCloseChannelModalStep("signing");
    } else if (closeChannelStep === "confirming") {
      setCloseChannelModalStep("confirming");
    } else if (closeChannelStep === "completed") {
      setCloseChannelModalStep("completed");
    } else if (closeChannelStep === "error") {
      setCloseChannelModalStep("error");
    }
  }, [closeChannelStep, closeChannelModalStep]);

  // Update error state from hook
  useEffect(() => {
    if (closeChannelHookError) {
      setCloseChannelError(closeChannelHookError);
      setCloseChannelModalStep("error");
    }
  }, [closeChannelHookError]);

  if (isLoadingProofs) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-8">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading verified proofs...</span>
          </div>
        </Card>
      </div>
    );
  }

  if (proofsError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-8">
          <div className="flex items-center gap-3 text-red-500">
            <AlertCircle className="h-6 w-6" />
            <span>{proofsError}</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-center gap-4">
          <div
            className={`flex items-center gap-2 ${
              phase === 1 ? "text-primary" : "text-green-500"
            }`}
          >
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full ${
                phase === 1
                  ? "bg-primary text-primary-foreground"
                  : "bg-green-500 text-white"
              }`}
            >
              {phase === 2 ? <CheckCircle className="h-5 w-5" /> : "1"}
            </div>
            <span className="font-medium">Submit Proof</span>
          </div>

          <ChevronRight className="h-5 w-5 text-muted-foreground" />

          <div
            className={`flex items-center gap-2 ${
              phase === 2 ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full ${
                phase === 2 ? "bg-primary text-primary-foreground" : "border-2"
              }`}
            >
              2
            </div>
            <span className="font-medium">Verify & Close</span>
          </div>
        </div>
      </div>

      {/* Phase 1: Submit Proof */}
      {phase === 1 && (
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-6">
            Phase 1: Submit Proof to Close Channel
          </h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">
                Channel Information
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Channel ID:</span>
                  <span className="ml-2 font-medium">#{channelId}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Current State:</span>
                  <span className="ml-2 font-medium">Open</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">
                Verified Proofs Available
              </h3>
              <div className="text-sm text-muted-foreground mb-4">
                Total: {verifiedProofs.length} proof(s)
              </div>

              {selectedProof && (
                <Card className="p-4 bg-muted/50">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium">{selectedProof.proofId}</div>
                      <div className="text-sm text-muted-foreground">
                        Sequence: {selectedProof.sequenceNumber}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Verified:{" "}
                        {new Date(selectedProof.verifiedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs bg-green-500/10 text-green-600 px-2 py-1 rounded">
                      Selected
                    </div>
                  </div>
                </Card>
              )}

              {!selectedProof && (
                <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 p-4 rounded-lg">
                  <AlertCircle className="h-5 w-5" />
                  <span>
                    No verified proofs available. Please verify proofs first.
                  </span>
                </div>
              )}
            </div>

            {submitProofError && (
              <div className="flex items-center gap-2 text-red-500 bg-red-50 p-4 rounded-lg">
                <AlertCircle className="h-5 w-5" />
                <span>{submitProofError}</span>
              </div>
            )}

            {submitProofSuccess && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                <CheckCircle className="h-5 w-5" />
                <span>Proof submitted successfully! Moving to Phase 2...</span>
              </div>
            )}

            {/* Step Progress for Phase 1 */}
            {isSubmittingTransaction && (
              <div className="p-4 bg-blue-50 rounded-lg space-y-3">
                <div className="text-sm font-medium text-blue-700 mb-2">
                  Transaction Progress
                </div>
                {TRANSACTION_STEPS.map((step, index) => {
                  const currentIndex = TRANSACTION_STEPS.findIndex(
                    (s) => s.key === submitProofStep
                  );
                  const isActive = step.key === submitProofStep;
                  const isCompleted = currentIndex > index;

                  return (
                    <div key={step.key} className="flex items-center gap-3">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-[#3EB100] flex-shrink-0" />
                      ) : isActive ? (
                        <Loader2 className="w-5 h-5 text-[#2A72E5] animate-spin flex-shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-[#CCCCCC] flex-shrink-0" />
                      )}
                      <span
                        className={`text-sm ${
                          isActive
                            ? "text-[#2A72E5] font-medium"
                            : isCompleted
                              ? "text-[#3EB100]"
                              : "text-[#999999]"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/state-explorer?channelId=${channelId}`)
                }
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitProof}
                disabled={
                  !selectedProof ||
                  isSubmittingTransaction ||
                  submitProofSuccess
                }
              >
                {isSubmittingTransaction && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isSubmittingTransaction
                  ? "Submitting..."
                  : "Submit Proof & Move to Closing"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Phase 2: Verify Final Balances */}
      {phase === 2 && (
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-6">
            Phase 2: Verify Final Balances & Close Channel
          </h2>

          <div className="space-y-6">
            <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
              <CheckCircle className="h-5 w-5" />
              <span>
                Proof submitted successfully. Channel is now in Closing state.
              </span>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">
                Final Balance Verification
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                This step will generate a Groth16 proof to verify the final
                state of all participants' balances and permanently close the
                channel.
              </p>

              {channelParticipants && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    Participants ({channelParticipants.length}):
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {channelParticipants.map((addr, idx) => (
                      <div key={idx} className="font-mono">
                        {addr}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {finalStateRoot && (
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium">Final State Root:</div>
                  <div className="text-xs font-mono text-muted-foreground break-all">
                    {finalStateRoot}
                  </div>
                </div>
              )}

              {channelTreeSize && (
                <div className="mt-4">
                  <div className="text-sm font-medium">
                    Tree Size: {Number(channelTreeSize)} leaves
                  </div>
                </div>
              )}

              {permutation.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium">Permutation Array:</div>
                  <div className="text-xs font-mono text-muted-foreground">
                    [{permutation.map((p) => p.toString()).join(", ")}]
                  </div>
                </div>
              )}

              {finalBalances.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium">Final Balances:</div>
                  <div className="text-xs space-y-1">
                    {finalBalances.map((balance, idx) => (
                      <div key={idx} className="font-mono">
                        Participant {idx + 1}: {balance.toString()} wei
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {finalProofStatus && (
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span className="text-blue-600">{finalProofStatus}</span>
              </div>
            )}

            {/* Step Progress for Phase 2 - Close Channel Transaction */}
            {isClosingChannelProcessing && (
              <div className="p-4 bg-blue-50 rounded-lg space-y-3">
                <div className="text-sm font-medium text-blue-700 mb-2">
                  Transaction Progress
                </div>
                {TRANSACTION_STEPS.map((step, index) => {
                  const currentIndex = TRANSACTION_STEPS.findIndex(
                    (s) => s.key === closeChannelStep
                  );
                  const isActive = step.key === closeChannelStep;
                  const isCompleted = currentIndex > index;

                  return (
                    <div key={step.key} className="flex items-center gap-3">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-[#3EB100] flex-shrink-0" />
                      ) : isActive ? (
                        <Loader2 className="w-5 h-5 text-[#2A72E5] animate-spin flex-shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-[#CCCCCC] flex-shrink-0" />
                      )}
                      <span
                        className={`text-sm ${
                          isActive
                            ? "text-[#2A72E5] font-medium"
                            : isCompleted
                              ? "text-[#3EB100]"
                              : "text-[#999999]"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {closeChannelError && (
              <div className="flex items-center gap-2 text-red-500 bg-red-50 p-4 rounded-lg">
                <AlertCircle className="h-5 w-5" />
                <span>{closeChannelError}</span>
              </div>
            )}

            {closeSuccess && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                <CheckCircle className="h-5 w-5" />
                <span>Channel closed successfully! Redirecting...</span>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setPhase(1)}
                disabled={isClosingChannel || isClosingChannelProcessing}
              >
                Back to Phase 1
              </Button>
              <Button
                onClick={handleOpenCloseChannelModal}
                disabled={
                  isClosingChannel ||
                  isClosingChannelProcessing ||
                  !channelParticipants ||
                  !finalStateRoot ||
                  !channelTreeSize
                }
              >
                Verify & Close Channel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Close Channel Confirm Modal */}
      {channelId && (
        <CloseChannelConfirmModal
          isOpen={showCloseChannelModal}
          onClose={handleCloseChannelModalClose}
          onConfirm={handleVerifyAndClose}
          channelId={channelId}
          participantsCount={channelParticipants?.length || 0}
          currentStep={closeChannelModalStep}
          onStepChange={setCloseChannelModalStep}
        />
      )}
    </div>
  );
}
