/**
 * API Route: Get Contract State for Proof Generation
 * 
 * Returns the current state of a channel's contract storage for proof generation.
 * Note: stateRoot parameter is accepted but not used - we always fetch current state from contract.
 */

import { NextRequest, NextResponse } from 'next/server';
import { http, createConfig } from '@wagmi/core';
import { readContracts } from '@wagmi/core';
import { getContractAddress, getContractAbi, NETWORKS } from '@tokamak/config';

const { sepolia } = NETWORKS;

// Get RPC URL from environment variable
const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';

console.log('[API] Using RPC URL:', rpcUrl);

// Configure wagmi for server-side use with increased timeout
const config = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(rpcUrl, {
      timeout: 60_000, // 60 seconds timeout
    }),
  },
});

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for this API route

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    const stateRoot = searchParams.get('stateRoot'); // Accepted but not used

    if (!channelId) {
      return NextResponse.json(
        { error: 'Missing required parameter: channelId' },
        { status: 400 }
      );
    }

    console.log('[API] get-contract-state-for-proof:', { channelId, stateRoot });

    const bridgeCoreAddress = getContractAddress('BridgeCore', sepolia.id);
    const bridgeCoreAbi = getContractAbi('BridgeCore');

    console.log('[API] BridgeCore address:', bridgeCoreAddress);
    console.log('[API] Reading channel data from contract...');

    // Read channel data from contract with retry logic
    let channelReadResults;
    let retries = 3;
    
    while (retries > 0) {
      try {
        channelReadResults = await readContracts(config, {
          contracts: [
            {
              address: bridgeCoreAddress,
              abi: bridgeCoreAbi,
              functionName: 'getChannelTargetContract',
              args: [channelId as `0x${string}`],
              chainId: sepolia.id,
            },
            {
              address: bridgeCoreAddress,
              abi: bridgeCoreAbi,
              functionName: 'getChannelState',
              args: [channelId as `0x${string}`],
              chainId: sepolia.id,
            },
            {
              address: bridgeCoreAddress,
              abi: bridgeCoreAbi,
              functionName: 'getChannelParticipants',
              args: [channelId as `0x${string}`],
              chainId: sepolia.id,
            },
          ],
        });
        break; // Success, exit retry loop
      } catch (error) {
        retries--;
        console.warn(`[API] RPC call failed, retries left: ${retries}`, error);
        if (retries === 0) {
          throw error; // Re-throw if no retries left
        }
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('[API] Channel read results:', channelReadResults);

    if (!channelReadResults) {
      return NextResponse.json(
        { error: 'Failed to read channel data from contract' },
        { status: 500 }
      );
    }

    const targetContract = channelReadResults[0]?.result as string;
    const state = channelReadResults[1]?.result as number;
    const participants = channelReadResults[2]?.result as readonly string[];

    if (!targetContract || !participants) {
      return NextResponse.json(
        { error: 'Failed to fetch channel data from contract' },
        { status: 500 }
      );
    }

    console.log('[API] Channel data:', { targetContract, state, participants });

    // Build storage entries for each participant
    const storageEntries: Array<{ key: string; value: string }> = [];

    // Get balance slot index from target contract
    let balanceSlotIndex = 0;
    const slotIndexResult = await readContracts(config, {
      contracts: [
        {
          address: bridgeCoreAddress,
          abi: bridgeCoreAbi,
          functionName: 'getBalanceSlotIndex',
          args: [targetContract as `0x${string}`],
          chainId: sepolia.id,
        },
      ],
    });
    if (slotIndexResult[0]?.status === "success") {
      balanceSlotIndex = Number(slotIndexResult[0].result);
      console.log('[API] Balance slot index:', balanceSlotIndex);
    }

    // Batch all participant data requests together
    const participantContracts = participants.flatMap((participant) => [
      {
        address: bridgeCoreAddress,
        abi: bridgeCoreAbi,
        functionName: 'getL2MptKey',
        args: [channelId as `0x${string}`, participant as `0x${string}`, balanceSlotIndex],
        chainId: sepolia.id,
      },
      {
        address: bridgeCoreAddress,
        abi: bridgeCoreAbi,
        functionName: 'getParticipantDeposit',
        args: [channelId as `0x${string}`, participant as `0x${string}`],
        chainId: sepolia.id,
      },
    ]);

    console.log('[API] Fetching data for', participants.length, 'participants...');

    // Read all participant data at once with retry
    let participantDataResults;
    retries = 3;
    
    while (retries > 0) {
      try {
        participantDataResults = await readContracts(config, {
          contracts: participantContracts,
        });
        break;
      } catch (error) {
        retries--;
        console.warn(`[API] Participant data RPC call failed, retries left: ${retries}`, error);
        if (retries === 0) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('[API] Participant data results:', participantDataResults);

    if (!participantDataResults) {
      return NextResponse.json(
        { error: 'Failed to fetch participant data from contract' },
        { status: 500 }
      );
    }

    // Process results (results are in pairs: [l2MptKey, balance, l2MptKey, balance, ...])
    for (let i = 0; i < participants.length; i++) {
      const l2MptKeyResult = participantDataResults[i * 2];
      const balanceResult = participantDataResults[i * 2 + 1];
      const participant = participants[i];

      if (!l2MptKeyResult || l2MptKeyResult.status !== 'success') {
        console.warn(`Failed to fetch L2 MPT key for participant ${participant}`);
        continue;
      }

      if (!balanceResult || balanceResult.status !== 'success') {
        console.warn(`Failed to fetch balance for participant ${participant}`);
        continue;
      }

      const l2MptKey = l2MptKeyResult.result as bigint;
      const balance = balanceResult.result as bigint;

      // Convert to hex string with 0x prefix
      const keyHex = `0x${l2MptKey.toString(16).padStart(64, '0')}`;
      const valueStr = balance.toString();

      storageEntries.push({
        key: keyHex,
        value: valueStr,
      });

      console.log('[API] Added storage entry for', participant, ':', { keyHex, valueStr });
    }

    console.log('[API] Total storage entries:', storageEntries.length);

    const responseData = {
      success: true,
      channelId,
      data: {
        targetContract,
        state,
        participants: participants as string[],
        storageEntries,
      },
    };

    console.log('[API] Response:', responseData);

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('[API] Error fetching contract state for proof:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to fetch contract state for proof',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
