# Tokamak Channel Extension

Chrome Extension for participating in Tokamak Private App Channels - secure Layer 2 state channel transactions with zero-knowledge proof verification.

## Features

- **Wallet Connection** - Connect MetaMask to interact with channels
- **Channel Dashboard** - View channel state, participants, and your status
- **Token Deposit** - Deposit tokens with automatic MPT key generation
- **L2 Transactions** - Send off-chain transactions to leader server
- **Proof Viewer** - Track proof status (pending/approved/rejected)
- **Token Withdrawal** - Withdraw tokens after channel closure

## Installation

### From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/tokamak-network/tokamak-zkp-channel-manager.git
   cd tokamak-zkp-channel-manager/extension
   ```

2. Install dependencies and build:
   ```bash
   bun install
   bun run build
   ```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `extension/dist/` folder

## Configuration

1. Click the extension icon in Chrome toolbar
2. Go to **Settings** (bottom navigation)
3. Configure:
   - **RPC URL**: Sepolia RPC endpoint (e.g., `https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY`)
   - **Leader Server URL**: URL of the channel leader's server
4. On **Home**, enter your Channel ID (bytes32 format: `0x...`)

## Usage

### View Channel Info

1. Enter a channel ID on the Home page
2. View:
   - Channel state (Initialized, Open, Closing, Closed)
   - Number of participants
   - Channel leader address
   - Your participation status

### Deposit Tokens

1. When channel is in "Initialized" state, click **Deposit**
2. **Step 1**: Generate MPT Key (sign a message)
3. **Step 2**: Approve token spend
4. **Step 3**: Deposit tokens to channel

### Send L2 Transactions

1. When channel is "Open", go to **Send** page
2. Enter recipient address and amount
3. Sign and submit transaction to leader server
4. Track proof status on **Activity** page

### Withdraw Tokens

1. When channel is "Closed", click **Withdraw** on Home
2. View your withdrawable balance
3. Confirm withdrawal transaction

## Development

```bash
# Install dependencies
bun install

# Development build with watch
bun run dev

# Production build
bun run build

# Type checking
bun run typecheck
```

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite + CRXJS** - Build system for Chrome Extensions
- **wagmi + viem** - Ethereum interaction
- **Tailwind CSS** - Styling
- **tokamak-l2js** - L2 key derivation

## Network

- **Network**: Sepolia Testnet (Chain ID: 11155111)
- **Supported Tokens**: TON

## Security

- Private keys are never stored - all signing is done via MetaMask
- L2 keys are derived from wallet signatures and kept in memory only
- Settings are stored in Chrome's sync storage

## License

MIT
