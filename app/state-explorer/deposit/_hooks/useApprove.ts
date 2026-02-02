/**
 * Custom Hook: useApprove
 *
 * Handles ERC20 token approval for deposit transactions
 */

import { useMemo, useEffect, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits } from "viem";
import { ERC20_ABI } from "@/lib/erc20";
import { useBridgeDepositManagerAddress } from "@/hooks/contract";

interface UseApproveParams {
  tokenAddress: `0x${string}`;
  depositAmount: string;
  tokenDecimals: number;
}

/**
 * Hook for managing ERC20 token approval for deposits
 */
export function useApprove({ tokenAddress, depositAmount, tokenDecimals }: UseApproveParams) {
  const { address } = useAccount();
  const depositManagerAddress = useBridgeDepositManagerAddress();

  // Parse deposit amount to bigint
  const parsedAmount = useMemo(() => {
    if (!depositAmount || depositAmount === "" || isNaN(Number(depositAmount))) {
      return BigInt(0);
    }
    try {
      return parseUnits(depositAmount, tokenDecimals);
    } catch {
      return BigInt(0);
    }
  }, [depositAmount, tokenDecimals]);

  // Check token balance
  const {
    data: balance,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
  } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!tokenAddress,
    },
  });

  // Check current allowance - refetch every block (12 seconds)
  const {
    data: allowance,
    isLoading: isLoadingAllowance,
    refetch: refetchAllowance,
  } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args:
      address && depositManagerAddress
        ? [address, depositManagerAddress]
        : undefined,
    query: {
      enabled: !!address && !!tokenAddress && !!depositManagerAddress,
      // Refetch every 5 seconds for responsive UX
      refetchInterval: 5_000,
      staleTime: 0,
      gcTime: 0,
    },
  });

  // Calculate if approval is needed
  const needsApproval = useMemo(() => {
    // If allowance is still loading, we can't determine if approval is needed yet
    if (isLoadingAllowance || allowance === undefined) {
      return false; // Don't show approve button while loading
    }
    
    // If no deposit amount, no approval needed
    if (parsedAmount === BigInt(0)) {
      return false;
    }
    
    // Check if allowance is less than required amount
    const allowanceBigInt = allowance as bigint;
    return parsedAmount > allowanceBigInt;
  }, [allowance, parsedAmount, isLoadingAllowance]);

  // Check if balance is insufficient
  const isInsufficientBalance = useMemo(() => {
    if (!balance || parsedAmount === BigInt(0)) return false;
    return parsedAmount > (balance as bigint);
  }, [balance, parsedAmount]);

  // Prepare approve transaction
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApprovePending,
    error: approveError,
  } = useWriteContract();

  const {
    isLoading: isApproving,
    isSuccess: approvalSuccess,
    error: approvalTxError,
  } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // Refetch allowance after successful approval
  useEffect(() => {
    if (approvalSuccess) {
      refetchAllowance();
    }
  }, [approvalSuccess, refetchAllowance]);

  // Handle approve
  const handleApprove = useCallback(async () => {
    if (
      !tokenAddress ||
      !depositManagerAddress ||
      parsedAmount === BigInt(0)
    ) {
      console.error("Missing required parameters for approval");
      return;
    }

    try {
      await writeApprove({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [depositManagerAddress, parsedAmount],
      });
    } catch (error) {
      console.error("❌ Error approving token:", error);
      throw error;
    }
  }, [tokenAddress, depositManagerAddress, parsedAmount, writeApprove]);

  return {
    allowance: allowance as bigint | undefined,
    balance: balance as bigint | undefined,
    needsApproval,
    isInsufficientBalance,
    isLoadingAllowance,
    isLoadingBalance,
    isApproving: isApproving || isApprovePending,
    approvalSuccess,
    approveTxHash,
    approveError: approveError || approvalTxError,
    handleApprove,
    refetchAllowance,
    refetchBalance,
  };
}
