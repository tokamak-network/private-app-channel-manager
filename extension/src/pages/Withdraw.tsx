import { CheckCircle, Loader2, AlertCircle, Coins } from 'lucide-react';
import { useWithdraw } from '../hooks/useWithdraw';
import { useSettings } from '../hooks/useSettings';
import { formatUnits } from 'viem';

export default function Withdraw() {
  const { settings } = useSettings();
  const {
    withdrawableAmount,
    hasWithdrawn,
    isLoadingAmount,
    handleWithdraw,
    isSigning,
    isConfirming,
    isWithdrawSuccess,
    withdrawHash,
    withdrawError,
  } = useWithdraw();

  // Format amount (18 decimals for TON)
  const formattedAmount = withdrawableAmount 
    ? formatUnits(BigInt(withdrawableAmount.toString()), 18)
    : '0';

  // Determine current step for UI
  const getCurrentStep = () => {
    if (isWithdrawSuccess) return 'completed';
    if (isConfirming) return 'confirming';
    if (isSigning) return 'signing';
    if (withdrawError) return 'error';
    return 'idle';
  };

  const currentStep = getCurrentStep();

  // Check if user can withdraw (has amount and hasn't withdrawn yet)
  const canWithdraw = !hasWithdrawn && parseFloat(formattedAmount) > 0 && currentStep === 'idle';

  if (!settings.channelId) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-text-secondary" />
        <div>
          <h3 className="font-medium">No Channel Selected</h3>
          <p className="text-sm text-text-secondary mt-1">
            Please set a Channel ID in Settings first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Withdraw</h2>
      </div>

      {/* Amount Display */}
      <div className="space-y-2">
        <label className="text-sm text-text-secondary">Withdrawable Amount</label>
        <div className="bg-surface rounded-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-background">
              <Coins className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-semibold text-primary">
              {isLoadingAmount ? '...' : formattedAmount}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-full border border-border">
            <span className="text-sm font-medium">TON</span>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {currentStep === 'signing' && (
        <div className="bg-surface rounded-card p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <span className="text-sm">Sign transaction in your wallet...</span>
        </div>
      )}

      {currentStep === 'confirming' && (
        <div className="bg-surface rounded-card p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <span className="text-sm">Confirming transaction...</span>
        </div>
      )}

      {currentStep === 'completed' && (
        <div className="bg-surface rounded-card p-4 flex items-center gap-3 border border-success/30">
          <CheckCircle className="w-5 h-5 text-success" />
          <div className="flex-1">
            <span className="text-sm text-success font-medium">Withdrawal Complete!</span>
            {withdrawHash && (
              <p className="text-xs text-text-tertiary mt-1 font-mono truncate">
                Tx: {withdrawHash.slice(0, 10)}...{withdrawHash.slice(-8)}
              </p>
            )}
          </div>
        </div>
      )}

      {withdrawError && (
        <div className="bg-surface rounded-card p-4 flex items-center gap-3 border border-error/30">
          <AlertCircle className="w-5 h-5 text-error" />
          <span className="text-sm text-error truncate">
            {withdrawError.message || 'Transaction failed'}
          </span>
        </div>
      )}

      {/* Already Withdrawn Notice */}
      {hasWithdrawn && currentStep !== 'completed' && (
        <div className="bg-surface rounded-card p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-text-secondary" />
          <span className="text-sm text-text-secondary">
            You have already withdrawn from this channel.
          </span>
        </div>
      )}

      {/* Action Button */}
      <div className="mt-auto">
        {hasWithdrawn && currentStep !== 'completed' ? (
          <button
            disabled
            className="w-full py-3 rounded-button bg-surface text-text-secondary font-medium cursor-not-allowed"
          >
            Already Withdrawn
          </button>
        ) : currentStep === 'completed' ? (
          <button
            disabled
            className="w-full py-3 rounded-button bg-success text-white font-medium flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Withdrawn Successfully
          </button>
        ) : (
          <button
            onClick={handleWithdraw}
            disabled={!canWithdraw}
            className="w-full py-3 rounded-button bg-primary text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:bg-primary/90"
          >
            {currentStep === 'signing' || currentStep === 'confirming' ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </span>
            ) : parseFloat(formattedAmount) === 0 ? (
              'No Balance to Withdraw'
            ) : (
              'Withdraw'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
