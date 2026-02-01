import { createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

const DEFAULT_RPC_URL = 'https://rpc.sepolia.org';

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(DEFAULT_RPC_URL),
  },
});

export { sepolia };
export const SEPOLIA_CHAIN_ID = sepolia.id;
