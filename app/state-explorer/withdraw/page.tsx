/**
 * Withdraw Component
 *
 * Component for withdrawing tokens from closed channel
 * Shows when channel is closed
 *
 * Design:
 * - https://www.figma.com/design/0R11fVZOkNSTJjhTKvUjc7/Ooo?node-id=3148-243134
 */

"use client";

import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { useChannelFlowStore } from "@/stores/useChannelFlowStore";
import { useWithdraw } from "./_hooks";
import { WithdrawConfirmModal } from "./_components";
import { formatUnits } from "viem";
import Image from "next/image";
import { useToken } from "../_context";

// TODO: Add dynamic token icons based on tokenSymbol
import TONSymbol from "@/assets/symbols/TON.svg";

function WithdrawPage() {
  const { tokenSymbol, tokenDecimals } = useToken();
  const { currentChannelId } = useChannelFlowStore();
  const {
    handleWithdraw,
    isWithdrawing,
    withdrawTxHash,
    withdrawSuccess,
    withdrawableAmount,
    currentStep,
    reset,
  } = useWithdraw({ channelId: currentChannelId });

  // Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const formattedAmount = formatUnits(withdrawableAmount, tokenDecimals);

  const tokenBalances = [
    { symbol: tokenSymbol, amount: formattedAmount, icon: TONSymbol },
  ];

  const handleOpenModal = () => {
    setShowConfirmModal(true);
  };

  const handleCloseModal = () => {
    setShowConfirmModal(false);
    reset();
  };

  return (
    <>
      {/* Withdraw Confirm Modal */}
      {showConfirmModal && currentChannelId && (
        <WithdrawConfirmModal
          channelId={currentChannelId}
          amount={formattedAmount}
          tokenSymbol={tokenSymbol}
          onWithdraw={handleWithdraw}
          isProcessing={isWithdrawing}
          txHash={withdrawTxHash ?? null}
          currentStep={currentStep}
          onClose={handleCloseModal}
        />
      )}

      <div className="font-mono" style={{ width: 544 }}>
        <div className="flex flex-col gap-6">
          {/* Title */}
          <h2
            className="font-medium text-[#111111]"
            style={{ fontSize: 32, lineHeight: "1.3em" }}
          >
            Withdraw
          </h2>

          {/* Amount Section */}
          <div className="flex flex-col gap-3">
            <span
              className="font-medium text-[#111111]"
              style={{ fontSize: 18, lineHeight: "1.3em" }}
            >
              Amount
            </span>

            {/* Token Balance Cards */}
            <div className="flex flex-col gap-3">
              {tokenBalances.map((token) => (
                <div
                  key={token.symbol}
                  className="flex items-center justify-between"
                  style={{
                    padding: "16px 24px",
                    borderRadius: 4,
                    border: "1px solid #5F5F5F",
                  }}
                >
                  {/* Amount */}
                  <span
                    className="font-medium"
                    style={{
                      fontSize: 24,
                      lineHeight: "1.3em",
                      color: "#2A72E5",
                    }}
                  >
                    {token.amount}
                  </span>

                  {/* Token Pill */}
                  <div
                    className="flex items-center gap-2"
                    style={{
                      height: 40,
                      padding: "8px 12px",
                      backgroundColor: "#DDDDDD",
                      borderRadius: "46px 40px 40px 46px",
                      border: "1px solid #9A9A9A",
                    }}
                  >
                    {/* Token Icon */}
                    <Image
                      src={token.icon}
                      alt={token.symbol}
                      width={24}
                      height={24}
                      className="rounded-full"
                    />
                    {/* Token Symbol */}
                    <span
                      className="text-[#111111]"
                      style={{ fontSize: 18, lineHeight: "1.3em" }}
                    >
                      {token.symbol}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Confirm Button */}
          <button
            onClick={handleOpenModal}
            disabled={isWithdrawing || withdrawSuccess}
            data-testid="withdraw-button"
            className="flex items-center justify-center font-mono font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              height: 40,
              padding: "16px 24px",
              borderRadius: 4,
              border: "1px solid #111111",
              backgroundColor: withdrawSuccess ? "#3EB100" : "#2A72E5",
              color: "#FFFFFF",
              fontSize: 20,
              lineHeight: "1.3em",
            }}
          >
            {withdrawSuccess ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Withdrawn
              </>
            ) : (
              "Confirm"
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export default WithdrawPage;
