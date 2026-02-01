import { useState, useEffect, useCallback } from 'react';
import { useSettings } from './useSettings';

export interface Proof {
  key: string;
  proofId: string;
  sequenceNumber: number;
  subNumber: number;
  submittedAt: string | number;
  submitter: string;
  status: 'pending' | 'approved' | 'rejected';
}

export function useProofs() {
  const { settings } = useSettings();
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProofs = useCallback(async (silent = false) => {
    const { leaderServerUrl, channelId } = settings;
    if (!leaderServerUrl || !channelId) {
      setProofs([]);
      return;
    }

    if (!silent) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const normalizedChannelId = channelId.toLowerCase();
      // Ensure leaderServerUrl doesn't end with slash
      const baseUrl = leaderServerUrl.endsWith('/') ? leaderServerUrl.slice(0, -1) : leaderServerUrl;

      const [submittedRes, verifiedRes, rejectedRes] = await Promise.all([
        fetch(`${baseUrl}/api/channels/${normalizedChannelId}/proofs?type=submitted`),
        fetch(`${baseUrl}/api/channels/${normalizedChannelId}/proofs?type=verified`),
        fetch(`${baseUrl}/api/channels/${normalizedChannelId}/proofs?type=rejected`),
      ]);

      const [submittedData, verifiedData, rejectedData] = await Promise.all([
        submittedRes.json(),
        verifiedRes.json(),
        rejectedRes.json(),
      ]);

      const allProofs: Proof[] = [
        ...(submittedData.data || submittedData.proofs || []).map((p: any) => ({ ...p, status: 'pending' as const })),
        ...(verifiedData.data || verifiedData.proofs || []).map((p: any) => ({ ...p, status: 'approved' as const })),
        ...(rejectedData.data || rejectedData.proofs || []).map((p: any) => ({ ...p, status: 'rejected' as const })),
      ];

      // Sort by sequence number (descending) so newest first
      allProofs.sort((a, b) => {
        if (a.sequenceNumber !== b.sequenceNumber) return b.sequenceNumber - a.sequenceNumber;
        return b.subNumber - a.subNumber;
      });

      setProofs(allProofs);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load proofs');
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    fetchProofs();
  }, [fetchProofs]);

  // Poll every 10 seconds
  useEffect(() => {
    const { leaderServerUrl, channelId } = settings;
    if (!leaderServerUrl || !channelId) return;
    
    const interval = setInterval(() => fetchProofs(true), 10000);
    return () => clearInterval(interval);
  }, [settings, fetchProofs]);

  return { proofs, isLoading, error, refetch: () => fetchProofs(false) };
}
