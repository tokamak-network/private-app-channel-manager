import type { OnRpcRequestHandler, OnHomePageHandler } from '@metamask/snaps-sdk';
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
  tokenAddress: string;
  tokenSymbol: string;
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

async function rpcCall(method: string, params: unknown[]): Promise<string> {
  try {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    console.log('RPC Request:', body);
    
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    
    const data = await response.json();
    console.log('RPC Response:', JSON.stringify(data));
    
    if (data.error) {
      throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
    }
    if (!data.result) {
      throw new Error('No result from RPC');
    }
    return data.result;
  } catch (e) {
    console.error('RPC call error:', e);
    throw e;
  }
}

function encodeBytes32(channelId: string): string {
  const hex = channelId.startsWith('0x') ? channelId.slice(2) : channelId;
  if (hex.length !== 64) {
    throw new Error(`Invalid bytes32: expected 64 hex chars, got ${hex.length}`);
  }
  return hex;
}

async function getChannelState(channelId: string): Promise<number> {
  const selector = '0xd18da8b1';
  const callData = selector + encodeBytes32(channelId);
  const result = await rpcCall('eth_call', [{ to: CONTRACT_ADDRESS, data: callData }, 'latest']);
  if (!result || result === '0x') {
    return 0;
  }
  return parseInt(result, 16);
}

async function getChannelLeader(channelId: string): Promise<string> {
  const selector = '0x842d86ba';
  const callData = selector + encodeBytes32(channelId);
  const result = await rpcCall('eth_call', [{ to: CONTRACT_ADDRESS, data: callData }, 'latest']);
  if (!result || result === '0x' || result.length < 42) {
    return '0x0000000000000000000000000000000000000000';
  }
  return '0x' + result.slice(26);
}

async function getChannelParticipants(channelId: string): Promise<string[]> {
  const selector = '0xba5b0880';
  const callData = selector + encodeBytes32(channelId);
  const result = await rpcCall('eth_call', [{ to: CONTRACT_ADDRESS, data: callData }, 'latest']);
  if (!result || result === '0x' || result.length < 130) {
    return [];
  }
  const hex = result.slice(2);
  const count = parseInt(hex.slice(64, 128), 16);
  const participants: string[] = [];
  for (let i = 0; i < count; i++) {
    const offset = 128 + i * 64;
    participants.push('0x' + hex.slice(offset + 24, offset + 64));
  }
  return participants;
}

async function getChannelTargetContract(channelId: string): Promise<string> {
  const selector = '0x4991aef9';
  const callData = selector + encodeBytes32(channelId);
  const result = await rpcCall('eth_call', [{ to: CONTRACT_ADDRESS, data: callData }, 'latest']);
  if (!result || result === '0x' || result.length < 42) {
    return '0x0000000000000000000000000000000000000000';
  }
  return '0x' + result.slice(26);
}

async function getTokenSymbol(tokenAddress: string): Promise<string> {
  const selector = '0x95d89b41';
  try {
    const result = await rpcCall('eth_call', [{ to: tokenAddress, data: selector }, 'latest']);
    if (!result || result === '0x') {
      return 'Unknown';
    }
    const hex = result.slice(2);
    const strLength = parseInt(hex.slice(64, 128), 16);
    const strHex = hex.slice(128, 128 + strLength * 2);
    let symbol = '';
    for (let i = 0; i < strHex.length; i += 2) {
      const charCode = parseInt(strHex.slice(i, i + 2), 16);
      if (charCode > 0) symbol += String.fromCharCode(charCode);
    }
    return symbol || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

async function getChannelInfo(channelId: string): Promise<ChannelInfo> {
  const [state, leader, participants, tokenAddress] = await Promise.all([
    getChannelState(channelId),
    getChannelLeader(channelId),
    getChannelParticipants(channelId),
    getChannelTargetContract(channelId),
  ]);
  const tokenSymbol = await getTokenSymbol(tokenAddress);
  return { state, leader, participantCount: participants.length, tokenAddress, tokenSymbol };
}

function formatAddress(address: string): string {
  if (!address || address.length < 10) return 'Unknown';
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
                <Text>Click "Set Channel ID" to configure your channel.</Text>
              </Box>
            ),
          },
        });
      }

      try {
        const channelId = settings.channelId.trim();
        console.log('Channel ID:', channelId, 'Length:', channelId.length);
        
        if (!channelId.startsWith('0x') || channelId.length !== 66) {
          throw new Error(`Invalid channel ID format: ${channelId.length} chars`);
        }
        
        const info = await getChannelInfo(channelId);
        console.log('Channel Info:', info);
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
                <Row label="Token">
                  <Text>{info.tokenSymbol}</Text>
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
                <Text>{e instanceof Error ? e.message : String(e)}</Text>
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
          placeholder: '0x...',
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
          placeholder: 'http://localhost:3000',
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

export const onHomePage: OnHomePageHandler = async () => {
  const settings = await getSettings();

  if (!settings.channelId) {
    return {
      content: (
        <Box>
          <Heading>Tokamak Channels</Heading>
          <Divider />
          <Text>No channel configured.</Text>
          <Text>Use a dApp to set your Channel ID.</Text>
        </Box>
      ),
    };
  }

  try {
    const info = await getChannelInfo(settings.channelId);
    return {
      content: (
        <Box>
          <Heading>Tokamak Channels</Heading>
          <Divider />
          <Row label="Channel">
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
          <Row label="Token">
            <Text>{info.tokenSymbol}</Text>
          </Row>
          <Row label="Leader">
            <Address address={info.leader as `0x${string}`} />
          </Row>
          {settings.leaderServerUrl ? (
            <Row label="Server">
              <Text>{settings.leaderServerUrl}</Text>
            </Row>
          ) : null}
        </Box>
      ),
    };
  } catch (e) {
    return {
      content: (
        <Box>
          <Heading>Tokamak Channels</Heading>
          <Divider />
          <Row label="Channel">
            <Text>{formatAddress(settings.channelId)}</Text>
          </Row>
          <Text>Failed to load channel info.</Text>
        </Box>
      ),
    };
  }
};
