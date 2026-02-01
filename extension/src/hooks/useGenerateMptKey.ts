import { useCallback, useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import {
  L2_PRV_KEY_MESSAGE,
  deriveL2KeysAndAddressFromSignature,
  type DerivedL2Account,
} from '../lib/tokamakl2js';

interface UseGenerateMptKeyParams {
  channelId?: string | null;
  slotIndex?: number;
}

export function useGenerateMptKey(params: UseGenerateMptKeyParams = {}) {
  const { channelId, slotIndex = 0 } = params;
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<DerivedL2Account | null>(null);

  useEffect(() => {
    setAccountInfo(null);
    setError(null);
  }, [channelId]);

  const generate = useCallback(async (): Promise<DerivedL2Account | null> => {
    if (!isConnected || !address) {
      setError('Please connect your wallet first');
      return null;
    }

    if (!channelId) {
      setError('Please provide a channel ID');
      return null;
    }

    if (!signMessageAsync) {
      setError('Wallet signing not available');
      return null;
    }

    setIsGenerating(true);
    setError(null);
    setAccountInfo(null);

    try {
      const message = L2_PRV_KEY_MESSAGE + channelId.toString();
      const signature = await signMessageAsync({ message });
      const account = deriveL2KeysAndAddressFromSignature(signature, slotIndex);

      setAccountInfo(account);
      return account;
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('User rejected') || err.message.includes('rejected')) {
          setError('Signature cancelled by user');
        } else {
          setError(`Error: ${err.message}`);
        }
      } else {
        setError('Failed to generate MPT key');
      }
      setAccountInfo(null);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [isConnected, address, channelId, signMessageAsync, slotIndex]);

  return {
    generate,
    isGenerating,
    error,
    accountInfo,
  };
}
