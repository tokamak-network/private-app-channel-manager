export const APP_NAME = "Tokamak Channels Extension";
export const APP_VERSION = "0.1.0";

export const CHANNEL_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  FROZEN: "frozen",
  CLOSED: "closed",
} as const;

export type ChannelStatus =
  (typeof CHANNEL_STATUS)[keyof typeof CHANNEL_STATUS];

export const MERKLE_TREE_CONFIG = {
  LEAVES: 16,
} as const;

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
    address: "0x42d3b260c761cD5da022dB56Fe2F89c4A909b04A" as `0x${string}`,
    decimals: 6,
    enabled: true,
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`,
    decimals: 6,
    enabled: true,
  },
} as const;

export type TokenSymbol = keyof typeof SUPPORTED_TOKENS;
export type TokenInfo = (typeof SUPPORTED_TOKENS)[TokenSymbol];

export const getTokenByAddress = (address: string): TokenInfo | undefined => {
  const normalizedAddress = address.toLowerCase();
  return Object.values(SUPPORTED_TOKENS).find(
    (token) => token.address.toLowerCase() === normalizedAddress
  );
};

export const TON_TOKEN_ADDRESS =
  "0xa30fe40285B8f5c0457DbC3B7C8A280373c40044" as `0x${string}`;

export const ERC20_TRANSFER: Record<
  `0x${string}`,
  { selector: `0x${string}`; slot: number }
> = {
  [TON_TOKEN_ADDRESS]: {
    selector: "0xa9059cbb",
    slot: 0,
  },
  ["0x42d3b260c761cD5da022dB56Fe2F89c4A909b04A" as `0x${string}`]: {
    selector: "0xa9059cbb",
    slot: 1,
  },
  ["0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`]: {
    selector: "0xa9059cbb",
    slot: 2,
  },
};
