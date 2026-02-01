import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { parseUnits } from 'viem';
import { ArrowRight, Loader2, Check, AlertCircle } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { L2_PRV_KEY_MESSAGE } from '../lib/tokamakl2js';
import { createERC20TransferTx, serializeTx } from '../lib/createL2Tx';
import { SUPPORTED_TOKENS } from '../config/constants';

type SendStep = 'input' | 'signing' | 'sending' | 'success' | 'error';

export default function Send() {
  const { isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { settings } = useSettings();

  const channelId = settings.channelId;
  const serverUrl = settings.leaderServerUrl;

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<'TON' | 'USDT' | 'USDC'>('TON');
  const [step, setStep] = useState<SendStep>('input');
  const [error, setError] = useState<string | null>(null);
  const [proofId, setProofId] = useState<string | null>(null);

  const token = SUPPORTED_TOKENS[selectedToken];

  const handleSend = async () => {
    if (!recipient || !amount || !channelId || !serverUrl || !signMessageAsync) {
      setError('Missing required fields');
      return;
    }

    setStep('signing');
    setError(null);

    try {
      const message = L2_PRV_KEY_MESSAGE + channelId;
      const signature = await signMessageAsync({ message });

      setStep('sending');

      const parsedAmount = parseUnits(amount, token.decimals);
      const tx = await createERC20TransferTx(
        0,
        recipient as `0x${string}`,
        parsedAmount,
        signature as `0x${string}`,
        token.address
      );

      const signedTxRlpStr = serializeTx(tx);

      const response = await fetch(`${serverUrl}/api/tokamak-zk-evm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'synthesize',
          channelId,
          signedTxRlpStr,
          includeProof: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      setProofId(result.proofId || 'Submitted');
      setStep('success');
    } catch (err) {
      setStep('error');
      if (err instanceof Error) {
        if (err.message.includes('rejected') || err.message.includes('User rejected')) {
          setError('Transaction cancelled by user');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to send transaction');
      }
    }
  };

  const resetForm = () => {
    setStep('input');
    setRecipient('');
    setAmount('');
    setError(null);
    setProofId(null);
  };

  if (!isConnected) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-12 h-12 text-text-tertiary mb-3" />
        <p className="text-text-secondary">Please connect your wallet first</p>
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-12 h-12 text-text-tertiary mb-3" />
        <p className="text-text-secondary">Please select a channel on Home tab</p>
      </div>
    );
  }

  if (!serverUrl) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-12 h-12 text-text-tertiary mb-3" />
        <p className="text-text-secondary">Please configure Leader Server URL in Settings</p>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Transaction Sent!</h2>
        <p className="text-sm text-text-secondary text-center mb-2">
          {amount} {selectedToken} sent to {recipient.slice(0, 10)}...
        </p>
        {proofId && (
          <p className="text-xs text-text-tertiary mb-4">Proof ID: {proofId}</p>
        )}
        <button
          onClick={resetForm}
          className="px-6 py-2 bg-primary rounded-button text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          Send Another
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Send L2 Transaction</h2>

      <div className="space-y-3">
        <div className="bg-surface rounded-card p-4 space-y-2">
          <label className="text-sm text-text-secondary">Token</label>
          <div className="flex gap-2">
            {(['TON', 'USDT', 'USDC'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedToken(t)}
                disabled={step !== 'input'}
                className={`flex-1 py-2 rounded-button text-sm font-medium transition-colors ${
                  selectedToken === t
                    ? 'bg-primary text-white'
                    : 'bg-background border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface rounded-card p-4 space-y-2">
          <label className="text-sm text-text-secondary">Recipient Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={step !== 'input'}
            className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary disabled:opacity-50"
          />
        </div>

        <div className="bg-surface rounded-card p-4 space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-text-secondary">Amount</label>
            <span className="text-xs text-text-tertiary">L2 Balance: — {selectedToken}</span>
          </div>
          <input
            type="text"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={step !== 'input'}
            className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
          />
        </div>
      </div>

      <div className="bg-surface rounded-card p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Network Fee</span>
          <span className="text-success">Free (L2)</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Server</span>
          <span className="text-xs font-mono truncate max-w-[180px]">{serverUrl}</span>
        </div>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/20 rounded-card p-3">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      <button
        onClick={handleSend}
        disabled={!recipient || !amount || step !== 'input'}
        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-text-tertiary text-white py-3 rounded-card font-medium transition-colors"
      >
        {step === 'signing' && (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sign with Wallet...
          </>
        )}
        {step === 'sending' && (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sending to Server...
          </>
        )}
        {step === 'input' && (
          <>
            Sign & Send
            <ArrowRight className="w-4 h-4" />
          </>
        )}
        {step === 'error' && 'Try Again'}
      </button>

      <p className="text-xs text-text-tertiary text-center">
        Transaction will be signed and sent to leader server for proof generation
      </p>
    </div>
  );
}
