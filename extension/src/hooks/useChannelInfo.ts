import { useReadContract, useAccount } from 'wagmi';
import { BRIDGECORE_ABI } from '../config/contracts/abis';
import { CONTRACT_ADDRESSES } from '../config/contracts/addresses';
import { useSettings } from './useSettings';

const CHANNEL_STATES = ['None', 'Initialized', 'Open', 'Closing', 'Closed'] as const;
type ChannelState = (typeof CHANNEL_STATES)[number];

export interface ChannelInfo {
  state: ChannelState;
  stateNumber: number;
  leader: `0x${string}` | null;
  participantCount: number;
  isParticipant: boolean;
  isWhitelisted: boolean;
}

export function useChannelInfo() {
  const { address } = useAccount();
  const { settings } = useSettings();
  const channelId = settings.channelId as `0x${string}` | undefined;
  const isValidChannelId = !!channelId && channelId.length === 66;

  const bridgeCoreAddress = CONTRACT_ADDRESSES.sepolia.BridgeCore as `0x${string}`;

  const { data: stateData, isLoading: isLoadingState } = useReadContract({
    address: bridgeCoreAddress,
    abi: BRIDGECORE_ABI,
    functionName: 'getChannelState',
    args: isValidChannelId ? [channelId] : undefined,
    query: { enabled: isValidChannelId },
  });

  const { data: leaderData, isLoading: isLoadingLeader } = useReadContract({
    address: bridgeCoreAddress,
    abi: BRIDGECORE_ABI,
    functionName: 'getChannelLeader',
    args: isValidChannelId ? [channelId] : undefined,
    query: { enabled: isValidChannelId },
  });

  const { data: participantsData, isLoading: isLoadingParticipants } = useReadContract({
    address: bridgeCoreAddress,
    abi: BRIDGECORE_ABI,
    functionName: 'getChannelParticipants',
    args: isValidChannelId ? [channelId] : undefined,
    query: { enabled: isValidChannelId },
  });

  const { data: whitelistData, isLoading: isLoadingWhitelist } = useReadContract({
    address: bridgeCoreAddress,
    abi: BRIDGECORE_ABI,
    functionName: 'isChannelWhitelisted',
    args: isValidChannelId && address ? [channelId, address] : undefined,
    query: { enabled: isValidChannelId && !!address },
  });

  const stateNumber = (stateData as number) ?? 0;
  const leader = leaderData as `0x${string}` | undefined;
  const participants = participantsData as `0x${string}`[] | undefined;
  const isWhitelisted = (whitelistData as boolean) ?? false;

  const isParticipant = address
    ? participants?.some((p) => p.toLowerCase() === address.toLowerCase()) ?? false
    : false;

  const isLoading = isLoadingState || isLoadingLeader || isLoadingParticipants || (address && isLoadingWhitelist);

  const channelInfo: ChannelInfo | null = isValidChannelId
    ? {
        state: CHANNEL_STATES[stateNumber] ?? 'None',
        stateNumber,
        leader: leader ?? null,
        participantCount: participants?.length ?? 0,
        isParticipant,
        isWhitelisted,
      }
    : null;

  return {
    channelId,
    channelInfo,
    isLoading,
    hasValidChannelId: isValidChannelId,
  };
}
