import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { BRIDGECORE_ABI, BRIDGEWITHDRAWMANAGER_ABI } from '../config/contracts/abis';
import { CONTRACT_ADDRESSES } from '../config/contracts/addresses';
import { useSettings } from './useSettings';

export function useWithdraw() {
  const { address } = useAccount();
  const { settings } = useSettings();
  const channelId = settings.channelId as `0x${string}` | undefined;
  
  // Addresses
  const bridgeCoreAddress = CONTRACT_ADDRESSES.sepolia.BridgeCore as `0x${string}`;
  const withdrawManagerAddress = CONTRACT_ADDRESSES.sepolia.BridgeWithdrawManager as `0x${string}`;

  // 1. Get Target Contract (Token)
  const { data: targetContract } = useReadContract({
    address: bridgeCoreAddress,
    abi: BRIDGECORE_ABI,
    functionName: 'getChannelTargetContract',
    args: channelId ? [channelId] : undefined,
    query: { enabled: !!channelId },
  });

  // 2. Check if user has already withdrawn
  const { data: hasWithdrawn } = useReadContract({
    address: bridgeCoreAddress,
    abi: BRIDGECORE_ABI,
    functionName: 'hasUserWithdrawn',
    args: channelId && address && targetContract ? [channelId, address, targetContract] : undefined,
    query: { enabled: !!channelId && !!address && !!targetContract },
  });

  // 3. Get Withdrawable Amount (Validated Slot Value)
  // Using slotIndex = 0 for TON as per instructions
  const { data: withdrawableAmount, isLoading: isLoadingAmount } = useReadContract({
    address: bridgeCoreAddress,
    abi: BRIDGECORE_ABI,
    functionName: 'getValidatedUserSlotValue',
    args: channelId && address ? [channelId, address, 0] : undefined,
    query: { enabled: !!channelId && !!address },
  });

  // 4. Withdraw Mutation
  const { 
    writeContract: withdraw, 
    data: withdrawHash, 
    isPending: isSigning,
    error: withdrawError 
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isWithdrawSuccess } = 
    useWaitForTransactionReceipt({ hash: withdrawHash });

  const handleWithdraw = () => {
    if (!channelId || !targetContract) return;
    
    withdraw({
      address: withdrawManagerAddress,
      abi: BRIDGEWITHDRAWMANAGER_ABI,
      functionName: 'withdraw',
      args: [channelId, targetContract],
    });
  };

  return {
    targetContract,
    hasWithdrawn,
    withdrawableAmount,
    isLoadingAmount,
    handleWithdraw,
    isSigning,
    isConfirming,
    isWithdrawSuccess,
    withdrawHash,
    withdrawError
  };
}
