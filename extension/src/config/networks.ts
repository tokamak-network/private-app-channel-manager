export interface NetworkConfig {
  id: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: {
    default: string;
  };
  blockExplorers: {
    default: {
      name: string;
      url: string;
    };
  };
}

export const NETWORKS = {
  sepolia: {
    id: 11155111,
    name: "Sepolia",
    nativeCurrency: {
      name: "Sepolia Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: {
      default: "https://rpc.sepolia.org",
    },
    blockExplorers: {
      default: {
        name: "Etherscan",
        url: "https://sepolia.etherscan.io",
      },
    },
  },
  mainnet: {
    id: 1,
    name: "Ethereum",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: {
      default: "https://eth.llamarpc.com",
    },
    blockExplorers: {
      default: {
        name: "Etherscan",
        url: "https://etherscan.io",
      },
    },
  },
} as const satisfies Record<string, NetworkConfig>;

export type NetworkId = keyof typeof NETWORKS;

export const DEFAULT_NETWORK: NetworkId = "sepolia";

export function getChainByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find((chain) => chain.id === chainId);
}

export function isSupportedChain(chainId: number): boolean {
  return Object.values(NETWORKS).some((chain) => chain.id === chainId);
}
