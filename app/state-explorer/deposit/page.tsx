/**
 * Deposit Component
 *
 * Component for depositing tokens to channel
 * Shows when channel is not initialized
 * Design based on Figma: https://www.figma.com/design/0R11fVZOkNSTJjhTKvUjc7/Ooo?node-id=3110-210864
 */

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useChannelFlowStore } from "@/stores/useChannelFlowStore";
import { useApprove, useIntegratedDeposit, type DepositStep } from "./_hooks";
import { useChannelInfo } from "@/hooks/useChannelInfo";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { FIXED_TARGET_CONTRACT } from "@tokamak/config";
import { useToken } from "../_context";
import { formatUnits } from "viem";
import { Copy, Info, CheckCircle2, Loader2, HelpCircle } from "lucide-react";
import { formatWithCommas } from "@/lib/utils/format";
import { Button, AmountInput } from "@/components/ui";
import { DepositConfirmModal } from "./_components/DepositConfirmModal";

function DepositPage() {
  const { currentChannelId } = useChannelFlowStore();
  const [depositAmount, setDepositAmount] = useState("");

  // Get token info from context
  const { tokenSymbol, tokenDecimals, tokenAddress: contextTokenAddress, isLoading: isTokenLoading } = useToken();
  
  // Get channel info for other channel data
  const channelInfo = useChannelInfo(
    currentChannelId ? (currentChannelId as `0x${string}`) : null
  );
  const tokenAddress = (contextTokenAddress || channelInfo?.targetContract || FIXED_TARGET_CONTRACT) as `0x${string}`;

  // Fetch user's token balance
  const { balance: userTokenBalance } = useTokenBalance({
    tokenAddress: tokenAddress || "0x",
  });

  // Determine if deposit amount exceeds user's balance
  const isInsufficientBalance = useMemo(() => {
    if (!depositAmount || !userTokenBalance) return false;
    try {
      const amount = parseFloat(depositAmount);
      if (isNaN(amount) || amount <= 0) return false;
      const amountWei = BigInt(Math.floor(amount * 10 ** tokenDecimals));
      return amountWei > userTokenBalance;
    } catch {
      return false;
    }
  }, [depositAmount, userTokenBalance, tokenDecimals]);

  // Use the approval hook
  const {
    needsApproval,
    isApproving,
    approvalSuccess,
    allowance,
    handleApprove,
    refetchAllowance,
    refetchBalance,
  } = useApprove({
    tokenAddress: tokenAddress as `0x${string}`,
    depositAmount,
    tokenDecimals,
  });

  // Format allowance for display
  const formattedAllowance = useMemo(() => {
    if (allowance === undefined) return "0";
    return formatWithCommas(formatUnits(allowance, tokenDecimals));
  }, [allowance, tokenDecimals]);

  // Refetch allowance when deposit amount changes
  useEffect(() => {
    if (depositAmount) {
      refetchAllowance();
    }
  }, [depositAmount, refetchAllowance]);

  // Memoized callback for deposit success
  const handleDepositSuccess = useCallback(() => {
    // Refetch allowance and balance after successful deposit
    refetchAllowance();
    refetchBalance();
  }, [refetchAllowance, refetchBalance]);

  // Use the integrated deposit hook (MPT key generation + deposit in one flow)
  const {
    startDeposit,
    currentStep,
    mptKey,
    isProcessing,
    error: depositError,
    txHash: depositTxHash,
    reset: resetDeposit,
  } = useIntegratedDeposit({
    channelId: currentChannelId,
    depositAmount,
    tokenDecimals,
    onDepositSuccess: handleDepositSuccess,
  });

  const handleMaxClick = () => {
    if (userTokenBalance !== undefined) {
      setDepositAmount(formatUnits(userTokenBalance, tokenDecimals));
    }
  };

  // Format balance for display
  const formattedBalance = useMemo(() => {
    if (userTokenBalance === undefined) return "0";
    return formatWithCommas(formatUnits(userTokenBalance, tokenDecimals));
  }, [userTokenBalance, tokenDecimals]);

  // Form is valid when deposit amount is entered, no balance issues, and approval done (if needed)
  const isFormValid =
    depositAmount &&
    parseFloat(depositAmount) >= 0 &&
    !isInsufficientBalance &&
    !isProcessing &&
    (!needsApproval || approvalSuccess);

  // Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleOpenConfirmModal = () => {
    if (isFormValid) {
      setShowConfirmModal(true);
    }
  };

  const handleCloseModal = () => {
    setShowConfirmModal(false);
    if (currentStep === "completed" || currentStep === "error") {
      resetDeposit();
    }
  };

  // Get step description for progress display
  const getStepDescription = (step: DepositStep): string => {
    switch (step) {
      case "signing_mpt":
        return "Signing to generate your L2 MPT Key...";
      case "mpt_generated":
        return "MPT Key generated!";
      case "signing_deposit":
        return "Signing deposit transaction...";
      case "confirming":
        return "Confirming transaction on blockchain...";
      case "completed":
        return "Deposit completed!";
      case "error":
        return "An error occurred";
      default:
        return "";
    }
  };

  if (isTokenLoading) {
    return (
      <div className="font-mono flex items-center justify-center" style={{ width: 544, minHeight: 200 }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#2A72E5] animate-spin" />
          <span className="text-[#666666]">Loading channel info...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono" style={{ width: 544 }}>
      {/* Deposit Section */}
      <div className="flex flex-col gap-6">
        {/* Title */}
        <h2
          className="font-medium text-[#111111]"
          style={{ fontSize: 32, lineHeight: "1.3em" }}
        >
          Deposit
        </h2>

        {/* Two Signatures Notice */}
        <div className="flex items-start gap-3 p-4 bg-[#E8F4FD] border border-[#B8DAFF] rounded-lg">
          <Info className="w-5 h-5 text-[#0056B3] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[#004085]">
            <p className="font-medium mb-1">Two wallet signatures required</p>
            <p className="text-[#004085]/80 leading-relaxed">
              Depositing requires two signatures: first to generate your unique L2 key, 
              then to confirm the deposit transaction.
            </p>
          </div>
        </div>

        {/* Generated MPT Key Display (only show after generation) */}
        {mptKey && (
          <div className="flex flex-col gap-3">
            <label
              className="font-medium text-[#111111]"
              style={{ fontSize: 18, lineHeight: "1.3em" }}
            >
              L2 MPT Key
            </label>
            <div
              className="w-full flex items-center justify-between"
              style={{
                backgroundColor: "#F2F2F2",
                borderRadius: 4,
                padding: "14px 16px",
                fontSize: 18,
                minHeight: 52,
              }}
            >
              <span className="text-[#111111] truncate" style={{ maxWidth: "calc(100% - 32px)" }}>
                {`${mptKey.slice(0, 42)}...`}
              </span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(mptKey)}
                className="flex-shrink-0 p-1 hover:bg-[#E5E5E5] rounded transition-colors"
                title="Copy MPT Key"
              >
                <Copy className="w-6 h-6 text-[#666666]" />
              </button>
            </div>
          </div>
        )}

        {/* Amount */}
        <AmountInput
          value={depositAmount}
          onChange={setDepositAmount}
          balance={formattedBalance}
          tokenSymbol={tokenSymbol}
          onMaxClick={handleMaxClick}
          error={isInsufficientBalance}
          testId="deposit-amount-input"
        />

        {/* Progress Steps (shown when processing) */}
        {isProcessing && currentStep !== "idle" && (
          <div className="flex items-center gap-3 p-4 bg-[#F8F9FA] border border-[#E5E5E5] rounded-lg">
            <Loader2 className="w-5 h-5 text-[#2A72E5] animate-spin flex-shrink-0" />
            <span className="text-sm text-[#666666]">
              {getStepDescription(currentStep)}
            </span>
          </div>
        )}

        {/* Success State */}
        {currentStep === "completed" && (
          <div className="flex items-center gap-3 p-4 bg-[#D4EDDA] border border-[#C3E6CB] rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-[#155724] flex-shrink-0" />
            <span className="text-sm text-[#155724]">
              Deposit completed successfully!
            </span>
          </div>
        )}

        {/* Error State */}
        {depositError && (
          <div className="p-4 bg-[#F8D7DA] border border-[#F5C6CB] rounded-lg">
            <p className="text-sm text-[#721C24]">{depositError}</p>
          </div>
        )}

        {/* Current Allowance Display */}
        <div className="flex justify-between items-center text-sm">
          <span className="text-[#666666]">Current Approval</span>
          <span className="text-[#111111] font-medium">
            {formattedAllowance} {tokenSymbol}
          </span>
        </div>

        {/* Approve Button - Show when approval is needed */}
        {needsApproval && !approvalSuccess && (
          <div className="relative group">
            <Button
              variant="success"
              size="full"
              onClick={handleApprove}
              disabled={!depositAmount || isApproving}
              testId="approve-button"
            >
              <span className="flex items-center justify-center gap-2">
                {isApproving
                  ? "Approving..."
                  : !depositAmount
                    ? "Enter Amount"
                    : "Approve"}
                {!isApproving && depositAmount && (
                  <HelpCircle className="w-5 h-5 text-white/80" />
                )}
              </span>
            </Button>
            {/* Tooltip - only show when ready to approve */}
            {depositAmount && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-4 py-3 bg-[#333333] text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10" style={{ width: 320 }}>
                <p className="font-medium mb-1">Token Approval Required</p>
                <p className="text-white/80 leading-relaxed">
                  This is a one-time permission that allows the channel contract to transfer your tokens. 
                  Your tokens remain in your wallet until you deposit.
                </p>
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                  <div className="border-4 border-transparent border-t-[#333333]"></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Deposit Button - Show when approval is done or not needed */}
        {(!needsApproval || approvalSuccess) && (
          <Button
            variant="primary"
            size="full"
            onClick={handleOpenConfirmModal}
            disabled={!isFormValid}
            testId="deposit-button"
          >
            {!depositAmount
              ? "Enter Amount"
              : isInsufficientBalance
                ? "Insufficient Balance"
                : "Deposit"}
          </Button>
        )}
      </div>

      {/* Deposit Confirm Modal */}
      {showConfirmModal && currentChannelId && (
        <DepositConfirmModal
          channelId={currentChannelId}
          depositAmount={depositAmount}
          tokenSymbol={tokenSymbol}
          onDeposit={startDeposit}
          isProcessing={isProcessing}
          txHash={depositTxHash ?? null}
          onClose={handleCloseModal}
          currentStep={currentStep}
        />
      )}
    </div>
  );
}

export default DepositPage;
