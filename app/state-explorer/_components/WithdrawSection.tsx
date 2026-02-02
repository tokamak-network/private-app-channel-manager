/**
 * Withdraw Section
 *
 * Component for withdrawing tokens from closed channel
 * Shows when channel is closed
 */

"use client";

import { Button, Card, CardContent } from "@tokamak/ui";
import { useWithdraw } from "../withdraw/_hooks";
import { useToken } from "../_context";

interface WithdrawSectionProps {
  channelId: string;
}

export function WithdrawSection({ channelId }: WithdrawSectionProps) {
  const { tokenSymbol } = useToken();
  const {
    handleWithdraw,
    isWithdrawing,
    withdrawSuccess,
    error,
  } = useWithdraw({ channelId });

  // TODO: Get from contract
  const withdrawableAmount = "10.5";

  return (
    <Card className="max-w-2xl">
      <CardContent className="space-y-6 pt-6">
        <div>
          <h3 className="text-xl font-semibold mb-2">Withdraw Tokens</h3>
          <p className="text-gray-600 text-sm">
            Channel is closed. You can now withdraw your tokens.
          </p>
        </div>

        {/* Withdrawable Amount */}
        <div className="p-6 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 mb-2">Available to Withdraw</p>
          <p className="text-3xl font-bold text-gray-900">
            {withdrawableAmount} {tokenSymbol}
          </p>
        </div>

        {/* Status Messages */}
        {withdrawSuccess && (
          <div className="p-4 bg-green-50 border border-green-200 rounded text-green-700">
            ✓ Tokens have been withdrawn successfully
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
            {error}
          </div>
        )}

        {/* Withdraw Button */}
        <Button
          onClick={handleWithdraw}
          disabled={isWithdrawing || withdrawSuccess}
          className="w-full"
        >
          {isWithdrawing
            ? "Withdrawing..."
            : withdrawSuccess
            ? "Already Withdrawn"
            : "Withdraw"}
        </Button>
      </CardContent>
    </Card>
  );
}
