import type { OnRpcRequestHandler } from '@metamask/snaps-sdk';
import type { Json } from '@metamask/snaps-sdk';
import {
  Box,
  Text,
  Bold,
  Heading,
  Divider,
  Row,
  Address,
  Copyable,
} from '@metamask/snaps-sdk/jsx';

interface Settings {
  leaderServerUrl: string;
  channelId: string;
}

interface ChannelInfo {
  state: number;
  leader: string;
  participantCount: number;
}

const CHANNEL_STATES = ['None', 'Initialized', 'Open', 'Closing', 'Closed'];

const CONTRACT_ADDRESS = '0xb6674f250b33cd35a89dbfbaf473645970bfdaf7';
const RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S';

async function getSettings(): Promise<Settings> {
  const state = await snap.request({
    method: 'snap_manageState',
    params: { operation: 'get' },
  });
  if (state && typeof state === 'object' && 'leaderServerUrl' in state && 'channelId' in state) {
    return state as unknown as Settings;
  }
  return { leaderServerUrl: '', channelId: '' };
}

async function saveSettings(settings: Settings): Promise<void> {
  await snap.request({
    method: 'snap_manageState',
    params: { 
      operation: 'update', 
      newState: settings as unknown as Record<string, Json>
    },
  });
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const data = await response.json();
  return data.result;
}

async function getChannelState(channelId: string): Promise<number> {
  const selector = '0xd18da8b1';
  const data = selector + channelId.slice(2);
  const result = await rpcCall('eth_call', [{ to: CONTRACT_ADDRESS, data }, 'latest']);
  return parseInt(result as string, 16);
}

async function getChannelLeader(channelId: string): Promise<string> {
  const selector = '0x842d86ba';
  const data = selector + channelId.slice(2);
  const result = await rpcCall('eth_call', [{ to: CONTRACT_ADDRESS, data }, 'latest']);
  return '0x' + (result as string).slice(26);
}

async function getChannelParticipants(channelId: string): Promise<string[]> {
  const selector = '0x8e7cb6e1';
  const data = selector + channelId.slice(2);
  const result = await rpcCall('eth_call', [{ to: CONTRACT_ADDRESS, data }, 'latest']);
  const hex = (result as string).slice(2);
  const count = parseInt(hex.slice(64, 128), 16);
  const participants: string[] = [];
  for (let i = 0; i < count; i++) {
    const offset = 128 + i * 64;
    participants.push('0x' + hex.slice(offset + 24, offset + 64));
  }
  return participants;
}

async function getChannelInfo(channelId: string): Promise<ChannelInfo> {
  const [state, leader, participants] = await Promise.all([
    getChannelState(channelId),
    getChannelLeader(channelId),
    getChannelParticipants(channelId),
  ]);
  return { state, leader, participantCount: participants.length };
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export const onRpcRequest: OnRpcRequestHandler = async ({ request }) => {
  switch (request.method) {
    case 'showHome': {
      const settings = await getSettings();

      if (!settings.channelId) {
        return snap.request({
          method: 'snap_dialog',
          params: {
            type: 'alert',
            content: (
              <Box>
                <Heading>Tokamak Channels</Heading>
                <Divider />
                <Text>No channel configured.</Text>
                <Text>Use 'Configure Settings' to set up your channel.</Text>
              </Box>
            ),
          },
        });
      }

      try {
        const info = await getChannelInfo(settings.channelId);
        return snap.request({
          method: 'snap_dialog',
          params: {
            type: 'alert',
            content: (
              <Box>
                <Heading>Channel Dashboard</Heading>
                <Divider />
                <Row label="Channel ID">
                  <Text>{formatAddress(settings.channelId)}</Text>
                </Row>
                <Row label="Status">
                  <Text>
                    <Bold>{CHANNEL_STATES[info.state] || 'Unknown'}</Bold>
                  </Text>
                </Row>
                <Row label="Participants">
                  <Text>{info.participantCount.toString()}</Text>
                </Row>
                <Row label="Leader">
                  <Address address={info.leader as `0x${string}`} />
                </Row>
                <Divider />
                <Row label="Server">
                  <Text>{settings.leaderServerUrl || 'Not set'}</Text>
                </Row>
              </Box>
            ),
          },
        });
      } catch (e) {
        return snap.request({
          method: 'snap_dialog',
          params: {
            type: 'alert',
            content: (
              <Box>
                <Heading>Error</Heading>
                <Text>Failed to load channel info.</Text>
                <Text>{e instanceof Error ? e.message : 'Unknown error'}</Text>
              </Box>
            ),
          },
        });
      }
    }

    case 'configureSettings': {
      const settings = await getSettings();
      const result = await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'prompt',
          content: (
            <Box>
              <Heading>Configure Channel</Heading>
              <Divider />
              <Text>Enter your Channel ID (bytes32):</Text>
              {settings.channelId ? (
                <Copyable value={settings.channelId} />
              ) : null}
            </Box>
          ),
          placeholder: settings.channelId || '0x...',
        },
      });

      if (result && typeof result === 'string' && result.startsWith('0x') && result.length === 66) {
        await saveSettings({ ...settings, channelId: result });
        return { success: true, channelId: result };
      }
      return { success: false, error: 'Invalid channel ID' };
    }

    case 'configureServer': {
      const settings = await getSettings();
      const result = await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'prompt',
          content: (
            <Box>
              <Heading>Configure Server</Heading>
              <Divider />
              <Text>Enter Leader Server URL:</Text>
              {settings.leaderServerUrl ? (
                <Copyable value={settings.leaderServerUrl} />
              ) : null}
            </Box>
          ),
          placeholder: settings.leaderServerUrl || 'http://localhost:3000',
        },
      });

      if (result && typeof result === 'string') {
        await saveSettings({ ...settings, leaderServerUrl: result });
        return { success: true, leaderServerUrl: result };
      }
      return { success: false, error: 'Invalid server URL' };
    }

    case 'getSettings': {
      const settings = await getSettings();
      return { 
        leaderServerUrl: settings.leaderServerUrl, 
        channelId: settings.channelId 
      };
    }

    case 'getChannelInfo': {
      const settings = await getSettings();
      if (!settings.channelId) {
        throw new Error('No channel configured');
      }
      const info = await getChannelInfo(settings.channelId);
      return {
        state: info.state,
        leader: info.leader,
        participantCount: info.participantCount,
      };
    }

    default:
      throw new Error('Method not found.');
  }
};
