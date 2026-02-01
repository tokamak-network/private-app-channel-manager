import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { ArrowDown, Key, Loader2, Check, AlertCircle } from 'lucide-react';
import { useGenerateMptKey } from '../hooks/useGenerateMptKey';
import { useSettings } from '../hooks/useSettings';
import { BRIDGEDEPOSITMANAGER_ABI } from '../config/contracts/abis';
import { CONTRACT_ADDRESSES } from '../config/contracts/addresses';
import { SUPPORTED_TOKENS } from '../config/constants';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

type DepositStep = 'input' | 'generate-key' | 'approve' | 'deposit' | 'success';

export default function Deposit() {
  const { isConnected } = useAccount();
  const { settings } = useSettings();
  const channelId = settings.channelId as `0x${string}` | undefined;

  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<'TON' | 'USDT' | 'USDC'>('TON');
  const [step, setStep] = useState<DepositStep>('input');

  const token = SUPPORTED_TOKENS[selectedToken];
  const depositManagerAddress = CONTRACT_ADDRESSES.sepolia.BridgeDepositManager as `0x${string}`;

  const { generate, isGenerating, accountInfo, error: mptError } = useGenerateMptKey({
    channelId,
    slotIndex: selectedToken === 'TON' ? 0 : selectedToken === 'USDT' ? 1 : 2,
  });

  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApproving,
  } = useWriteContract();

  const { isLoading: isWaitingApprove, isSuccess: isApproveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    writeContract: writeDeposit,
    data: depositHash,
    isPending: isDepositing,
  } = useWriteContract();

  const { isLoading: isWaitingDeposit, isSuccess: isDepositSuccess } =
    useWaitForTransactionReceipt({ hash: depositHash });

  const handleGenerateKey = async () => {
    setStep('generate-key');
    const result = await generate();
    if (result) {
      setStep('approve');
    } else {
      setStep('input');
    }
  };

  const handleApprove = () => {
    if (!amount || !token) return;
    const parsedAmount = parseUnits(amount, token.decimals);

    writeApprove({
      address: token.address,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [depositManagerAddress, parsedAmount],
    });
  };

  const handleDeposit = () => {
    if (!channelId || !accountInfo || !amount || !token) return;
    const parsedAmount = parseUnits(amount, token.decimals);

    writeDeposit({
      address: depositManagerAddress,
      abi: BRIDGEDEPOSITMANAGER_ABI,
      functionName: 'depositToken',
      args: [channelId, parsedAmount, [accountInfo.mptKey as `0x${string}`]],
    });
  };

  if (isApproveSuccess && step === 'approve') {
    setStep('deposit');
  }

  if (isDepositSuccess && step === 'deposit') {
    setStep('success');
  }

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
        <p className="text-text-secondary">Please select a channel first</p>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Deposit Successful!</h2>
        <p className="text-sm text-text-secondary text-center mb-4">
          {amount} {selectedToken} has been deposited to the channel
        </p>
        <button
          onClick={() => {
            setStep('input');
            setAmount('');
          }}
          className="px-6 py-2 bg-primary rounded-button text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          Make Another Deposit
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Deposit Tokens</h2>

      <div className="bg-surface rounded-card p-4 space-y-4">
        <div className="space-y-2">
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

        <div className="space-y-2">
          <label className="text-sm text-text-secondary">Amount</label>
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

      {accountInfo && (
        <div className="bg-surface rounded-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Key className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">MPT Key Generated</span>
          </div>
          <p className="text-xs font-mono text-text-secondary break-all">
            {accountInfo.mptKey}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {step === 'input' && (
          <button
            onClick={handleGenerateKey}
            disabled={!amount || isGenerating}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-text-tertiary text-white py-3 rounded-card font-medium transition-colors"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing...
              </>
            ) : (
              <>
                <Key className="w-4 h-4" />
                Generate MPT Key
              </>
            )}
          </button>
        )}

        {step === 'approve' && (
          <button
            onClick={handleApprove}
            disabled={isApproving || isWaitingApprove}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white py-3 rounded-card font-medium transition-colors"
          >
            {isApproving || isWaitingApprove ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isApproving ? 'Confirm in Wallet...' : 'Waiting for Approval...'}
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Approve {selectedToken}
              </>
            )}
          </button>
        )}

        {step === 'deposit' && (
          <button
            onClick={handleDeposit}
            disabled={isDepositing || isWaitingDeposit}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white py-3 rounded-card font-medium transition-colors"
          >
            {isDepositing || isWaitingDeposit ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isDepositing ? 'Confirm in Wallet...' : 'Depositing...'}
              </>
            ) : (
              <>
                <ArrowDown className="w-4 h-4" />
                Deposit {amount} {selectedToken}
              </>
            )}
          </button>
        )}
      </div>

      {mptError && (
        <p className="text-sm text-error text-center">{mptError}</p>
      )}

      <div className="text-xs text-text-tertiary space-y-1">
        <p>Step 1: Generate your MPT key (sign with wallet)</p>
        <p>Step 2: Approve token spending</p>
        <p>Step 3: Deposit tokens to channel</p>
      </div>
    </div>
  );
}
