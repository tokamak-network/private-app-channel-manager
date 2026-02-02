import type {
  OnRpcRequestHandler,
  OnHomePageHandler,
  OnUserInputHandler,
} from '@metamask/snaps-sdk';
import { UserInputEventType } from '@metamask/snaps-sdk';
import {
  Box,
  Text,
  Bold,
  Heading,
  Divider,
  Row,
  Address,
  Copyable,
  Button,
  Form,
  Field,
  Input,
} from '@metamask/snaps-sdk/jsx';
import {
  L2_PRV_KEY_MESSAGE,
  deriveL2KeysFromSignature,
  deriveL2AddressFromKeys,
  deriveL2MptKeyFromAddress,
} from 'tokamak-l2js';

// ============================================================================
// Types
// ============================================================================

type Settings = {
  leaderServerUrl: string;
  channelId: string;
};

type ChannelInfo = {
  state: number;
  leader: string;
  participantCount: number;
  tokenAddress: string;
  tokenSymbol: string;
};

type ViewName =
  | 'menu'
  | 'setChannelId'
  | 'setServerUrl'
  | 'dashboard'
  | 'deposit'
  | 'send'
  | 'withdraw'
  | 'activity';

type TransactionRecord = {
  type: 'deposit' | 'send' | 'withdraw';
  amount: string;
  timestamp: number;
  status: string;
  txHash?: string;
};

// ============================================================================
// Constants
// ============================================================================

const CHANNEL_STATES = ['None', 'Initialized', 'Open', 'Closing', 'Closed'];
const BRIDGE_CORE_ADDRESS = '0xb6674f250b33cd35a89dbfbaf473645970bfdaf7';
const BRIDGE_DEPOSIT_MANAGER_ADDRESS =
  '0xc430477c58fd96243ea07e90cc3c517857492e91';
const BRIDGE_WITHDRAW_MANAGER_ADDRESS =
  '0x1247aece17bc89f5bf6b170710a988200c7582ae';
const RPC_URL =
  'https://eth-sepolia.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S';
const SEPOLIA_CHAIN_ID = '0xaa36a7';

// Button names for navigation
const NAV = {
  SET_CHANNEL_ID: 'nav_setChannelId',
  SET_SERVER_URL: 'nav_setServerUrl',
  DASHBOARD: 'nav_dashboard',
  DEPOSIT: 'nav_deposit',
  SEND: 'nav_send',
  WITHDRAW: 'nav_withdraw',
  ACTIVITY: 'nav_activity',
  BACK: 'nav_back',
} as const;

// Form names
const FORMS = {
  SET_CHANNEL_ID: 'form_setChannelId',
  SET_SERVER_URL: 'form_setServerUrl',
  DEPOSIT: 'form_deposit',
  SEND: 'form_send',
  WITHDRAW: 'form_withdraw',
} as const;

// ============================================================================
// State Management
// ============================================================================

/**
 *
 */
async function getSettings(): Promise<Settings> {
  const state = await snap.request({
    method: 'snap_manageState',
    params: { operation: 'get' },
  });
  if (
    state &&
    typeof state === 'object' &&
    'leaderServerUrl' in state &&
    'channelId' in state
  ) {
    return state as unknown as Settings;
  }
  return { leaderServerUrl: '', channelId: '' };
}

/**
 *
 * @param settings
 */
async function saveSettings(settings: Settings): Promise<void> {
  await snap.request({
    method: 'snap_manageState',
    params: {
      operation: 'update',
      newState: settings as Record<string, string>,
    },
  });
}

// ============================================================================
// RPC Utilities
// ============================================================================

/**
 *
 * @param method
 * @param params
 */
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

/**
 *
 * @param channelId
 */
function encodeBytes32(channelId: string): string {
  const hex = channelId.startsWith('0x') ? channelId.slice(2) : channelId;
  if (hex.length !== 64) {
    throw new Error(
      `Invalid bytes32: expected 64 hex chars, got ${hex.length}`,
    );
  }
  return hex;
}

// ============================================================================
// Contract Read Functions
// ============================================================================

/**
 *
 * @param channelId
 */
async function getChannelState(channelId: string): Promise<number> {
  const selector = '0xd18da8b1';
  const callData = selector + encodeBytes32(channelId);
  const result = await rpcCall('eth_call', [
    { to: BRIDGE_CORE_ADDRESS, data: callData },
    'latest',
  ]);
  if (!result || result === '0x') {
    return 0;
  }
  return parseInt(result, 16);
}

/**
 *
 * @param channelId
 */
async function getChannelLeader(channelId: string): Promise<string> {
  const selector = '0x842d86ba';
  const callData = selector + encodeBytes32(channelId);
  const result = await rpcCall('eth_call', [
    { to: BRIDGE_CORE_ADDRESS, data: callData },
    'latest',
  ]);
  if (!result || result === '0x' || result.length < 42) {
    return '0x0000000000000000000000000000000000000000';
  }
  return `0x${result.slice(26)}`;
}

/**
 *
 * @param channelId
 */
async function getChannelParticipants(channelId: string): Promise<string[]> {
  const selector = '0xba5b0880';
  const callData = selector + encodeBytes32(channelId);
  const result = await rpcCall('eth_call', [
    { to: BRIDGE_CORE_ADDRESS, data: callData },
    'latest',
  ]);
  if (!result || result === '0x' || result.length < 130) {
    return [];
  }
  const hex = result.slice(2);
  const count = parseInt(hex.slice(64, 128), 16);
  const participants: string[] = [];
  for (let i = 0; i < count; i++) {
    const offset = 128 + i * 64;
    participants.push(`0x${hex.slice(offset + 24, offset + 64)}`);
  }
  return participants;
}

/**
 *
 * @param channelId
 */
async function getChannelTargetContract(channelId: string): Promise<string> {
  const selector = '0x4991aef9';
  const callData = selector + encodeBytes32(channelId);
  const result = await rpcCall('eth_call', [
    { to: BRIDGE_CORE_ADDRESS, data: callData },
    'latest',
  ]);
  if (!result || result === '0x' || result.length < 42) {
    return '0x0000000000000000000000000000000000000000';
  }
  return `0x${result.slice(26)}`;
}

/**
 *
 * @param tokenAddress
 */
async function getTokenSymbol(tokenAddress: string): Promise<string> {
  const selector = '0x95d89b41';
  try {
    const result = await rpcCall('eth_call', [
      { to: tokenAddress, data: selector },
      'latest',
    ]);
    if (!result || result === '0x') {
      return 'Unknown';
    }
    const hex = result.slice(2);
    const strLength = parseInt(hex.slice(64, 128), 16);
    const strHex = hex.slice(128, 128 + strLength * 2);
    let symbol = '';
    for (let i = 0; i < strHex.length; i += 2) {
      const charCode = parseInt(strHex.slice(i, i + 2), 16);
      if (charCode > 0) {
        symbol += String.fromCharCode(charCode);
      }
    }
    return symbol || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

/**
 *
 * @param channelId
 */
async function getChannelInfo(channelId: string): Promise<ChannelInfo> {
  const [state, leader, participants, tokenAddress] = await Promise.all([
    getChannelState(channelId),
    getChannelLeader(channelId),
    getChannelParticipants(channelId),
    getChannelTargetContract(channelId),
  ]);
  const tokenSymbol = await getTokenSymbol(tokenAddress);
  return {
    state,
    leader,
    participantCount: participants.length,
    tokenAddress,
    tokenSymbol,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 *
 * @param address
 */
function formatAddress(address: string): string {
  if (!address || address.length < 10) {
    return 'Unknown';
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 *
 * @param value
 */
function encodeUint256(value: string): string {
  const bn = BigInt(value);
  return bn.toString(16).padStart(64, '0');
}

/**
 *
 * @param address
 */
function encodeAddress(address: string): string {
  const hex = address.startsWith('0x') ? address.slice(2) : address;
  return hex.toLowerCase().padStart(64, '0');
}

/**
 *
 * @param value
 * @param decimals
 */
function parseUnits(value: string, decimals: number = 18): string {
  const [whole, fraction = ''] = value.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const combined = whole + paddedFraction;
  return BigInt(combined).toString();
}

// ============================================================================
// MPT Key Generation
// ============================================================================

async function generateMptKey(
  channelId: string,
  slotIndex: number = 0,
): Promise<`0x${string}`> {
  const userAddress = await getUserAddress();
  const message = L2_PRV_KEY_MESSAGE + channelId;

  const signature = (await ethereum.request({
    method: 'personal_sign',
    params: [message, userAddress],
  })) as `0x${string}`;

  const keys = deriveL2KeysFromSignature(signature);
  const l2Address = deriveL2AddressFromKeys(keys);
  const mptKey = deriveL2MptKeyFromAddress(l2Address, slotIndex);

  return mptKey;
}

// ============================================================================
// L1 Transaction Functions
// ============================================================================

async function getUserAddress(): Promise<string> {
  const accounts = (await ethereum.request({
    method: 'eth_accounts',
  })) as string[];
  if (!accounts || accounts.length === 0) {
    throw new Error('No connected account found');
  }
  const account = accounts[0];
  if (!account) {
    throw new Error('No connected account found');
  }
  return account;
}

/**
 *
 * @param channelId
 * @param amount
 * @param mptKey
 */
async function executeDeposit(
  channelId: string,
  amount: string,
  mptKey: string,
): Promise<string> {
  const userAddress = await getUserAddress();

  const selector = '0x7d9adc60';
  const encodedChannelId = encodeBytes32(channelId);
  const encodedAmount = encodeUint256(parseUnits(amount, 18));
  const arrayOffset =
    '0000000000000000000000000000000000000000000000000000000000000060';
  const arrayLength =
    '0000000000000000000000000000000000000000000000000000000000000001';
  const encodedMptKey = encodeBytes32(mptKey);

  const callData =
    selector +
    encodedChannelId +
    encodedAmount +
    arrayOffset +
    arrayLength +
    encodedMptKey;

  const txHash = (await ethereum.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: userAddress,
        to: BRIDGE_DEPOSIT_MANAGER_ADDRESS,
        data: callData,
        chainId: SEPOLIA_CHAIN_ID,
      },
    ],
  })) as string;

  return txHash;
}

/**
 *
 * @param channelId
 * @param tokenAddress
 */
async function executeWithdraw(
  channelId: string,
  tokenAddress: string,
): Promise<string> {
  const userAddress = await getUserAddress();

  const selector = '0xd9caed12';
  const encodedChannelId = encodeBytes32(channelId);
  const encodedTokenAddress = encodeAddress(tokenAddress);

  const callData = selector + encodedChannelId + encodedTokenAddress;

  const txHash = (await ethereum.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: userAddress,
        to: BRIDGE_WITHDRAW_MANAGER_ADDRESS,
        data: callData,
        chainId: SEPOLIA_CHAIN_ID,
      },
    ],
  })) as string;

  return txHash;
}

// ============================================================================
// L2 Transaction Functions (via Leader Server)
// ============================================================================

/**
 *
 * @param serverUrl
 * @param channelId
 * @param recipient
 * @param amount
 */
async function executeL2Transfer(
  serverUrl: string,
  channelId: string,
  recipient: string,
  amount: string,
): Promise<{ success: boolean; txId?: string; error?: string }> {
  const userAddress = await getUserAddress();

  const message = JSON.stringify({
    channelId,
    from: userAddress,
    to: recipient,
    amount: parseUnits(amount, 18),
    timestamp: Date.now(),
  });

  const signature = (await ethereum.request({
    method: 'personal_sign',
    params: [message, userAddress],
  })) as string;

  const response = await fetch(`${serverUrl}/api/l2-transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId,
      from: userAddress,
      to: recipient,
      amount: parseUnits(amount, 18),
      signature,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return { success: false, error: data.error || 'Transfer failed' };
  }

  return { success: true, txId: data.txId };
}

/**
 *
 * @param serverUrl
 * @param channelId
 */
async function fetchTransactionHistory(
  serverUrl: string,
  channelId: string,
): Promise<TransactionRecord[]> {
  if (!serverUrl || !channelId) {
    return [];
  }

  try {
    const response = await fetch(
      `${serverUrl}/api/channels/${channelId}/activity`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.transactions || [];
  } catch {
    return [];
  }
}

// ============================================================================
// View Components
// ============================================================================

/**
 *
 * @param settings
 */
function MenuView(settings: Settings) {
  const hasChannel = Boolean(settings.channelId);

  return (
    <Box>
      <Heading>Tokamak Channels</Heading>
      <Divider />

      {/* Settings Section */}
      <Text>
        <Bold>Settings</Bold>
      </Text>
      <Box direction="horizontal">
        <Button name={NAV.SET_CHANNEL_ID}>Set Channel ID</Button>
        <Button name={NAV.SET_SERVER_URL}>Set Server URL</Button>
      </Box>

      <Divider />

      {/* Channel Actions */}
      <Text>
        <Bold>Channel Actions</Bold>
      </Text>
      <Box direction="horizontal">
        <Button name={NAV.DASHBOARD} disabled={!hasChannel}>
          Dashboard
        </Button>
        <Button name={NAV.ACTIVITY} disabled={!hasChannel}>
          Activity
        </Button>
      </Box>

      <Divider />

      {/* Transactions */}
      <Text>
        <Bold>Transactions</Bold>
      </Text>
      <Box direction="horizontal">
        <Button name={NAV.DEPOSIT} disabled={!hasChannel}>
          Deposit
        </Button>
        <Button name={NAV.SEND} disabled={!hasChannel}>
          Send
        </Button>
        <Button name={NAV.WITHDRAW} disabled={!hasChannel}>
          Withdraw
        </Button>
      </Box>

      {/* Current Config Status */}
      <Divider />
      <Row label="Channel">
        <Text>
          {hasChannel ? formatAddress(settings.channelId) : 'Not set'}
        </Text>
      </Row>
      <Row label="Server">
        <Text>{settings.leaderServerUrl || 'Not set'}</Text>
      </Row>
    </Box>
  );
}

/**
 *
 * @param settings
 */
function SetChannelIdView(settings: Settings) {
  return (
    <Box>
      <Heading>Set Channel ID</Heading>
      <Divider />
      <Text>Enter your Channel ID (bytes32 format):</Text>
      {settings.channelId ? (
        <Box>
          <Text>Current:</Text>
          <Copyable value={settings.channelId} />
        </Box>
      ) : null}
      <Form name={FORMS.SET_CHANNEL_ID}>
        <Field label="Channel ID">
          <Input
            name="channelId"
            placeholder="0x..."
            value={settings.channelId}
          />
        </Field>
        <Box direction="horizontal">
          <Button name={NAV.BACK}>Back</Button>
          <Button type="submit">Save</Button>
        </Box>
      </Form>
    </Box>
  );
}

/**
 *
 * @param settings
 */
function SetServerUrlView(settings: Settings) {
  return (
    <Box>
      <Heading>Set Server URL</Heading>
      <Divider />
      <Text>Enter Leader Server URL for L2 transactions:</Text>
      {settings.leaderServerUrl ? (
        <Box>
          <Text>Current:</Text>
          <Copyable value={settings.leaderServerUrl} />
        </Box>
      ) : null}
      <Form name={FORMS.SET_SERVER_URL}>
        <Field label="Server URL">
          <Input
            name="serverUrl"
            placeholder="http://localhost:3000"
            value={settings.leaderServerUrl}
          />
        </Field>
        <Box direction="horizontal">
          <Button name={NAV.BACK}>Back</Button>
          <Button type="submit">Save</Button>
        </Box>
      </Form>
    </Box>
  );
}

/**
 *
 * @param settings
 * @param channelInfo
 */
function DashboardView(settings: Settings, channelInfo: ChannelInfo | null) {
  if (!channelInfo) {
    return (
      <Box>
        <Heading>Dashboard</Heading>
        <Divider />
        <Text>Loading channel info...</Text>
        <Button name={NAV.BACK}>Back</Button>
      </Box>
    );
  }

  return (
    <Box>
      <Heading>Dashboard</Heading>
      <Divider />
      <Row label="Channel">
        <Text>{formatAddress(settings.channelId)}</Text>
      </Row>
      <Row label="Status">
        <Text>
          <Bold>{CHANNEL_STATES[channelInfo.state] || 'Unknown'}</Bold>
        </Text>
      </Row>
      <Row label="Participants">
        <Text>{channelInfo.participantCount.toString()}</Text>
      </Row>
      <Row label="Token">
        <Text>{channelInfo.tokenSymbol}</Text>
      </Row>
      <Row label="Token Address">
        <Address address={channelInfo.tokenAddress as `0x${string}`} />
      </Row>
      <Row label="Leader">
        <Address address={channelInfo.leader as `0x${string}`} />
      </Row>
      <Divider />
      <Row label="Server">
        <Text>{settings.leaderServerUrl || 'Not set'}</Text>
      </Row>
      <Divider />
      <Button name={NAV.BACK}>Back to Menu</Button>
    </Box>
  );
}

/**
 *
 * @param settings
 */
function DepositView(settings: Settings) {
  return (
    <Box>
      <Heading>Deposit Tokens</Heading>
      <Divider />
      <Text>Deposit tokens to your channel (L1 transaction)</Text>
      <Text>MPT Key will be generated automatically from your signature.</Text>
      <Row label="Channel">
        <Text>{formatAddress(settings.channelId)}</Text>
      </Row>
      <Form name={FORMS.DEPOSIT}>
        <Field label="Amount (tokens)">
          <Input name="amount" placeholder="0.0" />
        </Field>
        <Box direction="horizontal">
          <Button name={NAV.BACK}>Back</Button>
          <Button type="submit">Deposit</Button>
        </Box>
      </Form>
    </Box>
  );
}

/**
 *
 * @param settings
 */
function SendView(settings: Settings) {
  return (
    <Box>
      <Heading>Send Tokens</Heading>
      <Divider />
      <Text>Send tokens via L2 (off-chain)</Text>
      <Row label="Channel">
        <Text>{formatAddress(settings.channelId)}</Text>
      </Row>
      <Form name={FORMS.SEND}>
        <Field label="Recipient Address">
          <Input name="recipient" placeholder="0x..." />
        </Field>
        <Field label="Amount">
          <Input name="amount" placeholder="0.0" />
        </Field>
        <Box direction="horizontal">
          <Button name={NAV.BACK}>Back</Button>
          <Button type="submit">Send</Button>
        </Box>
      </Form>
    </Box>
  );
}

/**
 *
 * @param settings
 * @param tokenAddress
 */
function WithdrawView(settings: Settings, tokenAddress: string) {
  return (
    <Box>
      <Heading>Withdraw Tokens</Heading>
      <Divider />
      <Text>Withdraw your balance from the channel (L1 transaction)</Text>
      <Text>This will withdraw all your available balance.</Text>
      <Row label="Channel">
        <Text>{formatAddress(settings.channelId)}</Text>
      </Row>
      <Row label="Token">
        <Address address={tokenAddress as `0x${string}`} />
      </Row>
      <Box direction="horizontal">
        <Button name={NAV.BACK}>Back</Button>
        <Button name="action_withdraw">Withdraw All</Button>
      </Box>
    </Box>
  );
}

/**
 *
 * @param settings
 * @param transactions
 */
function ActivityView(settings: Settings, transactions: TransactionRecord[]) {
  if (!settings.leaderServerUrl) {
    return (
      <Box>
        <Heading>Activity</Heading>
        <Divider />
        <Text>
          Configure Server URL in Settings to view transaction history.
        </Text>
        <Divider />
        <Button name={NAV.BACK}>Back to Menu</Button>
      </Box>
    );
  }

  if (transactions.length === 0) {
    return (
      <Box>
        <Heading>Activity</Heading>
        <Divider />
        <Row label="Channel">
          <Text>{formatAddress(settings.channelId)}</Text>
        </Row>
        <Divider />
        <Text>No transactions yet.</Text>
        <Divider />
        <Button name={NAV.BACK}>Back to Menu</Button>
      </Box>
    );
  }

  return (
    <Box>
      <Heading>Activity</Heading>
      <Divider />
      <Row label="Channel">
        <Text>{formatAddress(settings.channelId)}</Text>
      </Row>
      <Divider />
      {transactions.slice(0, 10).map((tx, index) => (
        <Box key={`tx-${index}`}>
          <Row label={tx.type.toUpperCase()}>
            <Text>{tx.amount} tokens</Text>
          </Row>
          <Row label="Status">
            <Text>{tx.status}</Text>
          </Row>
          {tx.txHash ? (
            <Row label="Hash">
              <Text>{formatAddress(tx.txHash)}</Text>
            </Row>
          ) : null}
          <Divider />
        </Box>
      ))}
      <Button name={NAV.BACK}>Back to Menu</Button>
    </Box>
  );
}

/**
 *
 * @param message
 */
function ErrorView(message: string) {
  return (
    <Box>
      <Heading>Error</Heading>
      <Divider />
      <Text>{message}</Text>
      <Divider />
      <Button name={NAV.BACK}>Back to Menu</Button>
    </Box>
  );
}

/**
 *
 * @param title
 * @param message
 */
function SuccessView(title: string, message: string) {
  return (
    <Box>
      <Heading>{title}</Heading>
      <Divider />
      <Text>{message}</Text>
      <Divider />
      <Button name={NAV.BACK}>Back to Menu</Button>
    </Box>
  );
}

// ============================================================================
// View Router
// ============================================================================

/**
 *
 * @param view
 * @param settings
 */
async function renderView(
  view: ViewName,
  settings: Settings,
): Promise<JSX.Element> {
  switch (view) {
    case 'menu':
      return MenuView(settings);

    case 'setChannelId':
      return SetChannelIdView(settings);

    case 'setServerUrl':
      return SetServerUrlView(settings);

    case 'dashboard':
      try {
        if (!settings.channelId) {
          return ErrorView('No channel configured');
        }
        const info = await getChannelInfo(settings.channelId);
        return DashboardView(settings, info);
      } catch (e) {
        return ErrorView(
          `Failed to load channel: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

    case 'deposit':
      return DepositView(settings);

    case 'send':
      return SendView(settings);

    case 'withdraw':
      try {
        if (!settings.channelId) {
          return ErrorView('No channel configured');
        }
        const tokenAddr = await getChannelTargetContract(settings.channelId);
        return WithdrawView(settings, tokenAddr);
      } catch (e) {
        return ErrorView(
          `Failed to load token info: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

    case 'activity':
      try {
        const transactions = await fetchTransactionHistory(
          settings.leaderServerUrl,
          settings.channelId,
        );
        return ActivityView(settings, transactions);
      } catch {
        return ActivityView(settings, []);
      }

    default:
      return MenuView(settings);
  }
}

// ============================================================================
// User Input Handler
// ============================================================================

export const onUserInput: OnUserInputHandler = async ({ id, event }) => {
  const settings = await getSettings();

  // Handle button clicks for navigation
  if (event.type === UserInputEventType.ButtonClickEvent) {
    const buttonName = event.name;
    let nextView: ViewName = 'menu';

    switch (buttonName) {
      case NAV.SET_CHANNEL_ID:
        nextView = 'setChannelId';
        break;
      case NAV.SET_SERVER_URL:
        nextView = 'setServerUrl';
        break;
      case NAV.DASHBOARD:
        nextView = 'dashboard';
        break;
      case NAV.DEPOSIT:
        nextView = 'deposit';
        break;
      case NAV.SEND:
        nextView = 'send';
        break;
      case NAV.WITHDRAW:
        nextView = 'withdraw';
        break;
      case NAV.ACTIVITY:
        nextView = 'activity';
        break;
      case NAV.BACK:
        nextView = 'menu';
        break;
      default:
        break;
    }

    if (buttonName === 'action_withdraw') {
      try {
        const tokenAddress = await getChannelTargetContract(settings.channelId);
        const txHash = await executeWithdraw(settings.channelId, tokenAddress);
        const ui = SuccessView(
          'Withdrawal Submitted',
          `Transaction submitted! Hash: ${formatAddress(txHash)}`,
        );
        await snap.request({
          method: 'snap_updateInterface',
          params: { id, ui },
        });
      } catch (e) {
        const ui = ErrorView(
          `Withdrawal failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        await snap.request({
          method: 'snap_updateInterface',
          params: { id, ui },
        });
      }
      return;
    }

    const ui = await renderView(nextView, settings);
    await snap.request({
      method: 'snap_updateInterface',
      params: { id, ui },
    });
    return;
  }

  // Handle form submissions
  if (event.type === UserInputEventType.FormSubmitEvent) {
    const formName = event.name;
    const formData = event.value as Record<string, string>;

    switch (formName) {
      case FORMS.SET_CHANNEL_ID: {
        const channelId = formData.channelId?.trim() ?? '';
        console.log('Form data received:', JSON.stringify(formData));
        console.log('Channel ID from form:', channelId);

        if (!channelId) {
          const ui = ErrorView('Please enter a Channel ID');
          await snap.request({
            method: 'snap_updateInterface',
            params: { id, ui },
          });
          return;
        }

        if (!channelId.startsWith('0x') || channelId.length !== 66) {
          const ui = ErrorView(
            `Invalid Channel ID format. Must be 66 characters starting with 0x. Got ${channelId.length} chars.`,
          );
          await snap.request({
            method: 'snap_updateInterface',
            params: { id, ui },
          });
          return;
        }

        await saveSettings({ ...settings, channelId });
        const updatedSettings = await getSettings();
        const ui = MenuView(updatedSettings);
        await snap.request({
          method: 'snap_updateInterface',
          params: { id, ui },
        });
        return;
      }

      case FORMS.SET_SERVER_URL: {
        const serverUrl = formData.serverUrl?.trim() ?? '';
        console.log('Server URL from form:', serverUrl);

        if (!serverUrl) {
          const ui = ErrorView('Please enter a server URL');
          await snap.request({
            method: 'snap_updateInterface',
            params: { id, ui },
          });
          return;
        }

        await saveSettings({ ...settings, leaderServerUrl: serverUrl });
        const updatedSettings = await getSettings();
        const ui = MenuView(updatedSettings);
        await snap.request({
          method: 'snap_updateInterface',
          params: { id, ui },
        });
        return;
      }

      case FORMS.DEPOSIT: {
        const amount = formData.amount?.trim() || '';

        if (!amount || parseFloat(amount) <= 0) {
          const ui = ErrorView('Please enter a valid amount');
          await snap.request({
            method: 'snap_updateInterface',
            params: { id, ui },
          });
          return;
        }

        try {
          const mptKey = await generateMptKey(settings.channelId, 0);
          const txHash = await executeDeposit(
            settings.channelId,
            amount,
            mptKey,
          );
          const ui = SuccessView(
            'Deposit Submitted',
            `Transaction submitted! Hash: ${formatAddress(txHash)}`,
          );
          await snap.request({
            method: 'snap_updateInterface',
            params: { id, ui },
          });
        } catch (e) {
          const ui = ErrorView(
            `Deposit failed: ${e instanceof Error ? e.message : String(e)}`,
          );
          await snap.request({
            method: 'snap_updateInterface',
            params: { id, ui },
          });
        }
        return;
      }

      case FORMS.SEND: {
        const recipient = formData.recipient?.trim() || '';
        const amount = formData.amount?.trim() || '';

        if (
          !recipient ||
          !recipient.startsWith('0x') ||
          recipient.length !== 42
        ) {
          const ui = ErrorView('Please enter a valid recipient address');
          await snap.request({
            method: 'snap_updateInterface',
            params: { id, ui },
          });
          return;
        }

        if (!amount || parseFloat(amount) <= 0) {
          const ui = ErrorView('Please enter a valid amount');
          await snap.request({
            method: 'snap_updateInterface',
            params: { id, ui },
          });
          return;
        }

        if (!settings.leaderServerUrl) {
          const ui = ErrorView('Please set a Server URL first in Settings');
          await snap.request({
            method: 'snap_updateInterface',
            params: { id, ui },
          });
          return;
        }

        try {
          const result = await executeL2Transfer(
            settings.leaderServerUrl,
            settings.channelId,
            recipient,
            amount,
          );

          if (result.success) {
            const ui = SuccessView(
              'Transfer Submitted',
              `L2 transfer submitted! ID: ${result.txId || 'pending'}`,
            );
            await snap.request({
              method: 'snap_updateInterface',
              params: { id, ui },
            });
          } else {
            const ui = ErrorView(`Transfer failed: ${result.error}`);
            await snap.request({
              method: 'snap_updateInterface',
              params: { id, ui },
            });
          }
        } catch (e) {
          const ui = ErrorView(
            `Transfer failed: ${e instanceof Error ? e.message : String(e)}`,
          );
          await snap.request({
            method: 'snap_updateInterface',
            params: { id, ui },
          });
        }
      }

      default:
        break;
    }
  }
};

// ============================================================================
// Home Page Handler (Entry Point)
// ============================================================================

export const onHomePage: OnHomePageHandler = async () => {
  const settings = await getSettings();
  const ui = await renderView('menu', settings);

  const interfaceId = await snap.request({
    method: 'snap_createInterface',
    params: { ui },
  });

  return { id: interfaceId };
};

// ============================================================================
// RPC Request Handler (for dApp integration)
// ============================================================================

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
          throw new Error(
            `Invalid channel ID format: ${channelId.length} chars`,
          );
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

      if (
        result &&
        typeof result === 'string' &&
        result.startsWith('0x') &&
        result.length === 66
      ) {
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
        channelId: settings.channelId,
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
