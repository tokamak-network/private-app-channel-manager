/**
 * Application Constants
 */

export const APP_NAME = "Tokamak Private App Channels";
export const APP_VERSION = "0.1.0";

/**
 * Channel Status
 */
export const CHANNEL_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  FROZEN: "frozen",
  CLOSED: "closed",
} as const;

export type ChannelStatus =
  (typeof CHANNEL_STATUS)[keyof typeof CHANNEL_STATUS];

/**
 * Merkle Tree Configuration
 *
 * These values are used to calculate the maximum number of participants:
 * N = (L - P) / S
 *
 * Where:
 * - L: Number of Merkle tree leaves
 * - P: Number of pre-allocated keys (fetched from contract per token)
 * - S: Number of selected tokens (storage slots per user)
 */
export const MERKLE_TREE_CONFIG = {
  /** Number of Merkle tree leaves (L) */
  LEAVES: 16,
} as const;

/**
 * Supported Tokens Configuration
 *
 * Token addresses for each supported token.
 * Pre-allocated keys (P) are fetched from contract dynamically.
 */
export const SUPPORTED_TOKENS = {
  TON: {
    symbol: "TON",
    name: "Tokamak Network",
    address: "0xa30fe40285B8f5c0457DbC3B7C8A280373c40044" as `0x${string}`,
    decimals: 18,
    enabled: true,
  },
  USDT: {
    symbol: "USDT",
    name: "Tether USD",
    address: "0x42d3b260c761cD5da022dB56Fe2F89c4A909b04A" as `0x${string}`, // Sepolia USDT (configured in BridgeAdminManager)
    decimals: 6,
    enabled: true,
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`, // Circle Sepolia USDC
    decimals: 6,
    enabled: true,
  },
} as const;

export type TokenSymbol = keyof typeof SUPPORTED_TOKENS;

export type TokenInfo = typeof SUPPORTED_TOKENS[TokenSymbol];

/**
 * Get token info by contract address
 * @param address - Token contract address (case-insensitive)
 * @returns Token info or undefined if not found
 */
export const getTokenByAddress = (address: string): TokenInfo | undefined => {
  const normalizedAddress = address.toLowerCase();
  return Object.values(SUPPORTED_TOKENS).find(
    (token) => token.address.toLowerCase() === normalizedAddress
  );
};

/**
 * Get token symbol by contract address
 * @param address - Token contract address (case-insensitive)
 * @returns Token symbol or undefined if not found
 */
export const getTokenSymbolByAddress = (address: string): TokenSymbol | undefined => {
  const normalizedAddress = address.toLowerCase();
  const entry = Object.entries(SUPPORTED_TOKENS).find(
    ([, token]) => token.address.toLowerCase() === normalizedAddress
  );
  return entry ? (entry[0] as TokenSymbol) : undefined;
};

/**
 * DKG Status
 */
export const DKG_STATUS = {
  WAITING: "waiting",
  ROUND1: "round1",
  ROUND2: "round2",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type DKGStatus = (typeof DKG_STATUS)[keyof typeof DKG_STATUS];

/**
 * Time Constants (milliseconds)
 */
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const;

/**
 * Pagination Defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
} as const;

/**
 * Transaction Settings
 */
export const TX_SETTINGS = {
  DEFAULT_GAS_LIMIT: BigInt(500000),
  CONFIRMATION_BLOCKS: 2,
} as const;

/**
 * Fixed Target Contract Address (Legacy - single token)
 *
 * @deprecated Use FIXED_TARGET_CONTRACTS array for multi-token support
 */
export const FIXED_TARGET_CONTRACT =
  "0xa30fe40285B8f5c0457DbC3B7C8A280373c40044" as `0x${string}`;

/**
 * Fixed Target Contract Addresses (Multi-token support)
 *
 * Array of target contract addresses for channel creation
 * Order: [TON, USDT, USDC]
 */
export const FIXED_TARGET_CONTRACTS: readonly `0x${string}`[] = [
  SUPPORTED_TOKENS.TON.address,
  SUPPORTED_TOKENS.USDT.address,
  SUPPORTED_TOKENS.USDC.address,
] as const;

/**
 * Get target contract addresses for selected tokens
 */
export const getTargetContractsForTokens = (symbols: TokenSymbol[]): `0x${string}`[] => {
  return symbols
    .filter(symbol => SUPPORTED_TOKENS[symbol].enabled)
    .map(symbol => SUPPORTED_TOKENS[symbol].address);
};

/**
 * TON Token Address (Sepolia testnet)
 */
export const TON_TOKEN_ADDRESS =
  "0xa30fe40285B8f5c0457DbC3B7C8A280373c40044" as `0x${string}`;

/**
 * USDT Token Address (Sepolia testnet - configured in BridgeAdminManager)
 */
export const USDT_TOKEN_ADDRESS =
  "0x42d3b260c761cD5da022dB56Fe2F89c4A909b04A" as `0x${string}`;

/**
 * USDC Token Address (Sepolia testnet - Circle)
 */
export const USDC_TOKEN_ADDRESS =
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`;

/**
 * ERC20 Transfer function selectors and balance Solidity slot offsets.
 * `slot` is the actual Solidity storage slot number for the balances mapping,
 * NOT the userStorageSlots array index. The EVM computes storage keys via
 * poseidon(l2Address, slotOffset), so this must match the contract layout.
 */
export const ERC20_TRANSFER: Record<
  `0x${string}`,
  { selector: `0x${string}`; slot: number }
> = {
  [TON_TOKEN_ADDRESS]: {
    selector: "0xa9059cbb",
    slot: 0, // TON balances mapping at Solidity slot 0
  },
  ["0x42d3b260c761cD5da022dB56Fe2F89c4A909b04A" as `0x${string}`]: {
    selector: "0xa9059cbb",
    slot: 2, // USDT balances mapping at Solidity slot 2
  },
  [USDC_TOKEN_ADDRESS]: {
    selector: "0xa9059cbb",
    slot: 9, // USDC _balances mapping at Solidity slot 9 (TODO: verify when USDC is registered)
  },
};
