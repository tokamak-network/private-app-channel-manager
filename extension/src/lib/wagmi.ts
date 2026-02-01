import { createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

const DEFAULT_RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S';

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [
    injected({
      shimDisconnect: true,
      target: 'metaMask',
    }),
  ],
  transports: {
    [sepolia.id]: http(DEFAULT_RPC_URL),
  },
});

export { sepolia };
export const SEPOLIA_CHAIN_ID = sepolia.id;
