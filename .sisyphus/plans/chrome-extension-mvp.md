# Chrome Extension MVP for Tokamak Private App Channels

## TL;DR

> **Quick Summary**: 크롬 익스텐션으로 채널 참여자용 클라이언트를 구현. 리더가 운영하는 서버에 연결하여 채널 참여, 입금, L2 트랜잭션 요청, 프루프 조회, 출금 기능 제공.
> 
> **Deliverables**:
> - Chrome Extension (Manifest V3) with React + Tailwind
> - 5 core features: Join, Deposit, L2 Tx Request, Proof View, Withdraw
> - Settings page for RPC URL and Leader Server URL configuration
> 
> **Estimated Effort**: Medium (2-3 weeks)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 0 → Task 1 → Task 2 → Tasks 3-7 (parallel) → Task 8

---

## Context

### Original Request
"현재 브라우저로 이루어지고 있는 채널 참여, 프루프 생성 및 제출 등의 기능을 크롬 익스텐션으로 만들 수 있을까? 바라보는 서버는 메타마스크에서 rpc 설정하듯이 유동적으로 변경하게 만들어서"

### Interview Summary
**Key Discussions**:
- **User Role**: 참여자(Participant)만 지원 (리더 기능 제외)
- **Server Architecture**: 리더가 서버 운영, 익스텐션은 URL 설정으로 연결
- **L2 Signing**: 익스텐션에서 WASM 호환성 테스트 후 시도, 실패 시 서버로 폴백
- **Proof Generation**: 리더 서버에서 모두 처리 (synthesize + prove + store)
- **Multi-channel**: MVP에서는 한 번에 하나의 채널만 관리

**Research Findings**:
- `hooks/contract/*.ts`의 wagmi 훅 패턴 재사용 가능
- `tokamak-l2js`는 WASM 사용 (poseidon 해싱) - Extension에서 테스트 필요
- `@tokamak/config`에서 컨트랙트 주소/ABI 가져오기 가능
- `useGenerateMptKey` 훅 패턴 그대로 포팅 가능

### Metis Review
**Identified Gaps** (addressed):
- **WASM 호환성**: Phase 0에서 go/no-go 테스트로 해결
- **Leader Server API**: 기존 Next.js API 사용 (문서화 추가)
- **Private Key 노출 위험**: 세션별 서명에서 파생, 저장 안 함

---

## Work Objectives

### Core Objective
채널 참여자가 크롬 익스텐션을 통해 리더 서버에 연결하고, 블록체인과 상호작용하여 채널 참여, 입금, L2 트랜잭션 요청, 프루프 조회, 출금을 수행할 수 있게 한다.

### Concrete Deliverables
- `extension/` 디렉토리에 Chrome Extension 프로젝트
- `manifest.json` (Manifest V3)
- React + Tailwind UI (popup + tab pages)
- 5 core features 구현
- Settings page (RPC URL, Leader Server URL)

### Definition of Done
- [ ] Extension이 Chrome Web Store에 업로드 가능한 상태
- [ ] `bun run build:extension` → production build 생성
- [ ] MetaMask 연결 → 채널 조회 → 입금 → L2 tx 요청 → 프루프 조회 → 출금 전체 플로우 동작
- [ ] 리더 서버 URL 변경 시 즉시 반영

### Must Have
- Manifest V3 호환
- MetaMask 지갑 연결 (injected provider)
- RPC URL 설정 기능
- Leader Server URL 설정 기능
- 채널 상태 조회 (on-chain)
- 입금 기능 (ERC20 approve + deposit)
- L2 트랜잭션 서명 및 서버 요청
- 프루프 목록 조회
- 출금 기능
- **MetaMask 스타일 월렛 UI/UX** (기존 웹앱 디자인과 다름)

### Must NOT Have (Guardrails)
- **No leader features**: 채널 생성, 초기화, 프루프 승인, 채널 종료
- **No snarkjs bundling**: ZK 증명 생성 코드 없음
- **No zkey files**: proving key 파일 번들링 안 함
- **No offline mode**: 항상 서버/블록체인 연결 필요
- **No multi-network selector**: Sepolia만 지원 (config에서 고정)
- **No custom token support**: SUPPORTED_TOKENS만 사용
- **No local proof verification**: 검증은 리더 서버에서
- **No private key storage**: L2 키는 세션별 서명에서 파생
- **No multi-channel**: MVP에서는 채널 하나만 관리

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (새 프로젝트)
- **User wants tests**: Manual verification + Playwright
- **Framework**: bun test (향후 확장 시)

### Automated Verification (ALWAYS include)

**All acceptance criteria use agent-executable verification:**

| Type | Verification Tool | Automated Procedure |
|------|------------------|---------------------|
| **Extension UI** | Playwright with extension loading | Agent loads extension, interacts, screenshots |
| **API Calls** | curl via Bash | Agent sends request, validates response |
| **Blockchain** | viem via Bash (bun script) | Agent queries contract, validates state |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Go/No-Go Gate):
└── Task 0: WASM Compatibility Test

Wave 1 (After Wave 0 passes):
├── Task 1: Extension Scaffold
└── (Sequential) Task 2: Wallet Connection

Wave 2 (After Wave 1):
├── Task 3: Settings Page
├── Task 4: Channel Dashboard
└── Task 5: Join Channel Flow

Wave 3 (After Wave 2):
├── Task 6: Deposit Flow
├── Task 7: L2 Transaction Request
└── Task 8: Proof Viewer

Wave 4 (After Wave 3):
└── Task 9: Withdraw Flow

Wave 5 (Final):
└── Task 10: Polish & Build
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | 1 | None (gate) |
| 1 | 0 | 2, 3, 4, 5 | None |
| 2 | 1 | 3, 4, 5, 6, 7, 8, 9 | None |
| 3 | 2 | 4, 5, 6, 7 | None (settings needed first) |
| 4 | 3 | 6, 7, 8 | 5 |
| 5 | 3 | 6 | 4 |
| 6 | 4, 5 | 9 | 7, 8 |
| 7 | 4 | 8 | 6 |
| 8 | 7 | 9 | 6 |
| 9 | 6, 8 | 10 | None |
| 10 | 9 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Approach |
|------|-------|---------------------|
| 0 | 0 | Single focused task - go/no-go |
| 1 | 1, 2 | Sequential (scaffold → wallet) |
| 2 | 3, 4, 5 | 3 first, then 4, 5 parallel |
| 3 | 6, 7, 8 | Can run in parallel |
| 4 | 9 | After deposit/proof features |
| 5 | 10 | Final polish |

---

## TODOs

### Task 0: WASM Compatibility Test (GO/NO-GO GATE)

- [x] 0. Test `tokamak-l2js` WASM in Chrome Extension Context (PASSED - No WASM, pure JS)

  **What to do**:
  - Create minimal Chrome Extension (MV3) with popup
  - Import `poseidon` from `tokamak-l2js`
  - Execute poseidon hash in popup context
  - Verify WASM execution succeeds without CSP errors
  - If fails: Document error and create server-side signing plan

  **Must NOT do**:
  - Full feature implementation
  - Complex UI
  - Any other library testing

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple POC task, single file test
  - **Skills**: [`playwright`]
    - `playwright`: Need to load and test extension

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Gate (must pass before anything else)
  - **Blocks**: All other tasks
  - **Blocked By**: None

  **References**:
  
  **Pattern References**:
  - `lib/tokamakl2js.ts:1-30` - tokamak-l2js import patterns and poseidon usage
  
  **API/Type References**:
  - `node_modules/tokamak-l2js/` - Package structure to understand exports
  
  **External References**:
  - Chrome Extension MV3 CSP: https://developer.chrome.com/docs/extensions/mv3/content_security_policy/
  - WASM in Extensions: https://developer.chrome.com/docs/extensions/mv3/wasm/

  **Acceptance Criteria**:

  ```bash
  # Agent creates extension/test-wasm/ with minimal extension
  # Agent runs:
  cd extension/test-wasm && bun install
  
  # Agent uses playwright to:
  # 1. Load extension in Chrome
  # 2. Open popup
  # 3. Check console for errors
  # 4. Verify output element shows "WASM OK" or "WASM FAIL"
  ```

  **Evidence to Capture**:
  - [ ] Console output (no CSP errors)
  - [ ] Screenshot of popup showing result
  - [ ] If fail: exact error message for fallback planning

  **Commit**: YES
  - Message: `test(extension): verify WASM compatibility in Chrome Extension MV3`
  - Files: `extension/test-wasm/*`
  - Pre-commit: N/A (POC)

---

### Task 1: Chrome Extension Scaffold with Wallet-Style Design

- [x] 1. Create Extension Project Structure with MetaMask-Style Design System

  **What to do**:
  - Create `extension/` directory at project root
  - Initialize with `bun init`
  - Set up Manifest V3 (`manifest.json`)
  - Configure build system (Vite + CRXJS or similar)
  - Set up React + Tailwind with **MetaMask-inspired design system**:
    - Fixed popup width: 360px (standard wallet size)
    - Dark theme as default (like MetaMask dark mode)
    - Rounded cards with subtle shadows
    - Color palette: deep blue primary (#037DD6), dark backgrounds (#24272A, #141618)
    - Sans-serif font (Inter or similar)
    - Bottom navigation bar for main sections
  - Create basic popup layout with:
    - Header: Network indicator + Connected address (truncated)
    - Main content area (scrollable)
    - Bottom nav: Home, Send, Activity, Settings
  - Bundle `@tokamak/config` as internal dependency

  **Must NOT do**:
  - Implement any features
  - Add wagmi/viem yet
  - Copy existing web app design (completely different UX)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New project setup with multiple config files
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Need proper React + Tailwind setup

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 0
  - **Blocks**: 2, 3, 4, 5, 6, 7, 8, 9
  - **Blocked By**: 0

  **References**:

  **Pattern References**:
  - `packages/config/src/constants.ts` - Constants to bundle
  - `packages/config/src/index.ts` - Package exports pattern

  **Design References** (MetaMask-style):
  - MetaMask Extension: https://metamask.io/ - Overall wallet UX pattern
  - Bottom navigation: Home (channel info), Send (L2 tx), Activity (proofs), Settings
  - Card-based layout for balances and transactions
  - Popup dimensions: 360px width, auto height (max ~600px)

  **External References**:
  - CRXJS Vite Plugin: https://crxjs.dev/vite-plugin/
  - Chrome Extension MV3: https://developer.chrome.com/docs/extensions/mv3/getstarted/
  - MetaMask Design System: https://github.com/MetaMask/design-tokens

  **Acceptance Criteria**:

  ```bash
  # Agent runs:
  cd extension && bun install && bun run build
  # Assert: Build succeeds without errors
  
  ls -la extension/dist/
  # Assert: manifest.json exists
  # Assert: popup.html exists
  
  # Agent uses playwright to:
  # 1. Load extension from extension/dist/
  # 2. Click extension icon
  # 3. Verify popup appears with:
  #    - Fixed width ~360px (wallet-style)
  #    - Dark theme background (#24272A or similar)
  #    - Bottom navigation with 4 icons (Home, Send, Activity, Settings)
  #    - Header area for network/account display
  ```

  **Evidence to Capture**:
  - [ ] Build output showing success
  - [ ] Screenshot of popup
  - [ ] File structure verification

  **Commit**: YES
  - Message: `feat(extension): scaffold Chrome Extension with React + Tailwind`
  - Files: `extension/*`
  - Pre-commit: `cd extension && bun run build`

---

### Task 2: Wallet Connection (MetaMask)

- [x] 2. Implement MetaMask Connection in Extension

  **What to do**:
  - Install wagmi, viem, @tanstack/react-query
  - Create wagmi config for injected provider (`window.ethereum`)
  - Implement connect/disconnect wallet UI
  - Show connected address in popup (truncated: 0x1234...5678)
  - Handle network mismatch (Sepolia only)
  - Store only public address in chrome.storage.local (NOT private keys)
  - **TRUST MODEL**: 웹앱과 100% 동일 - MetaMask에 서명 요청만 함, private key 접근 없음

  **Technical Note - Extension에서 window.ethereum 접근**:
  - Extension popup 자체는 `window.ethereum`에 직접 접근 불가
  - **Content Script 방식**: 활성 탭에 스크립트 주입하여 provider 접근
  - 또는 **Offscreen Document 방식** (MV3): offscreen.html에서 provider 접근
  - wagmi는 이를 내부적으로 처리하므로 직접 구현 불필요할 수 있음 - 테스트 필요

  **Must NOT do**:
  - Implement WalletConnect
  - Add network switching feature
  - Implement any channel features
  - **NEVER store or access private keys** - extension은 서명 요청만 함

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with wallet integration
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Need polished wallet connection UX

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 1
  - **Blocks**: 3, 4, 5, 6, 7, 8, 9
  - **Blocked By**: 1

  **References**:

  **Pattern References**:
  - `app/providers.tsx` - WagmiProvider setup pattern
  - `components/wallet-connect-button.tsx` - Connect button pattern
  - `hooks/contract/utils.ts:useNetworkId` - Network detection pattern

  **API/Type References**:
  - `packages/config/src/networks.ts` - Sepolia network config

  **External References**:
  - Wagmi in React: https://wagmi.sh/react/getting-started
  - Chrome Extension Storage: https://developer.chrome.com/docs/extensions/reference/storage/

  **Acceptance Criteria**:

  ```bash
  # Agent uses playwright to:
  # 1. Load extension
  # 2. Click "Connect Wallet" button
  # 3. Verify MetaMask popup appears (or mock)
  # 4. After connection, verify address displayed (0x...)
  # 5. Refresh popup, verify still connected (persisted)
  # 6. Click disconnect, verify returns to connect state
  ```

  **Evidence to Capture**:
  - [ ] Screenshot: Connect button visible
  - [ ] Screenshot: Address displayed after connection
  - [ ] Console: No errors during connect/disconnect

  **Commit**: YES
  - Message: `feat(extension): add MetaMask wallet connection`
  - Files: `extension/src/providers/*, extension/src/components/WalletButton.*`
  - Pre-commit: `cd extension && bun run build`

---

### Task 3: Settings Page

- [x] 3. Implement Settings Page with RPC and Server URL

  **What to do**:
  - Create Settings tab page
  - RPC URL input with validation (https:// required)
  - Leader Server URL input with validation
  - Save/Load from chrome.storage.sync
  - Test connection button for both
  - Use Sepolia RPC default from config

  **Must NOT do**:
  - Network selector (Sepolia only)
  - Multiple server profiles
  - Import/export settings

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Form UI with validation
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Settings page needs good UX

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs wallet first)
  - **Parallel Group**: Sequential after Task 2
  - **Blocks**: 4, 5, 6, 7
  - **Blocked By**: 2

  **References**:

  **Pattern References**:
  - `packages/config/src/networks.ts` - Default RPC URL
  - `components/ui/input.tsx` - Input component pattern

  **External References**:
  - Chrome Storage Sync: https://developer.chrome.com/docs/extensions/reference/storage/#property-sync

  **Acceptance Criteria**:

  ```bash
  # Agent uses playwright to:
  # 1. Open extension Settings page
  # 2. Enter RPC URL: "https://eth-sepolia.g.alchemy.com/v2/test"
  # 3. Enter Server URL: "http://localhost:3000"
  # 4. Click Save
  # 5. Close and reopen extension
  # 6. Verify URLs persisted
  
  # Test connection validation:
  # 7. Click "Test RPC" with valid URL → shows "Connected"
  # 8. Click "Test RPC" with invalid URL → shows "Connection failed"
  ```

  **Evidence to Capture**:
  - [ ] Screenshot: Settings page with both inputs
  - [ ] Screenshot: "Connected" status after test
  - [ ] Storage verification via chrome.storage.sync.get

  **Commit**: YES
  - Message: `feat(extension): add settings page for RPC and server URL`
  - Files: `extension/src/pages/Settings.*, extension/src/hooks/useSettings.*`
  - Pre-commit: `cd extension && bun run build`

---

### Task 4: Channel Dashboard

- [x] 4. Implement Channel Info Display

  **What to do**:
  - Channel ID input (bytes32)
  - Fetch channel info from blockchain:
    - State (None/Initialized/Open/Closing/Closed)
    - Leader address
    - Participant count
    - User's deposit amount (if deposited)
    - Target tokens
  - Display channel status badge
  - Store active channelId in chrome.storage.local
  - Show "Not in channel" if user not whitelisted/participant

  **Must NOT do**:
  - Channel creation
  - Channel list/history
  - Multi-channel management

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Data display with contract reads
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Dashboard UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: 6, 7, 8
  - **Blocked By**: 3

  **References**:

  **Pattern References**:
  - `hooks/contract/useBridgeCore.ts:43-54` - Contract read hook pattern
  - `app/state-explorer/_components/ChannelInfo.tsx` - Channel info display pattern
  - `hooks/useChannelInfo.ts` - Channel data aggregation pattern

  **API/Type References**:
  - `packages/config/src/contracts/abis.ts` - BridgeCore ABI
  - Contract functions: `getChannelState`, `getChannelLeader`, `getChannelParticipants`

  **Acceptance Criteria**:

  ```bash
  # Agent runs verification script:
  bun -e "
    import { createPublicClient, http } from 'viem';
    import { sepolia } from 'viem/chains';
    import { CONTRACT_ABIS, getContractAddress } from '@tokamak/config';
    
    const client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
    const state = await client.readContract({
      address: getContractAddress('BridgeCore', 11155111),
      abi: CONTRACT_ABIS.BridgeCore,
      functionName: 'getChannelState',
      args: ['0x...channelId']
    });
    console.log('State:', state);
  "
  # Assert: Returns valid state (0-4)
  
  # Agent uses playwright to:
  # 1. Enter channel ID in extension
  # 2. Verify channel state badge shows (e.g., "Open")
  # 3. Verify leader address displayed
  # 4. Verify participant count shown
  ```

  **Evidence to Capture**:
  - [ ] Screenshot: Channel dashboard with all info
  - [ ] Contract read output verification

  **Commit**: YES
  - Message: `feat(extension): add channel dashboard with on-chain data`
  - Files: `extension/src/pages/Dashboard.*, extension/src/hooks/useChannelInfo.*`
  - Pre-commit: `cd extension && bun run build`

---

### Task 5: Join Channel Flow

- [x] 5. Implement Channel Join (Whitelist Check)

  **What to do**:
  - Check if user is whitelisted (state < 2) or participant (state >= 2)
  - Display appropriate status message
  - Show "Join" button if whitelisted but not deposited
  - Link to deposit flow from join status

  **Must NOT do**:
  - Whitelist management (leader only)
  - Auto-join without user action
  - Channel creation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple status check and display
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: 6
  - **Blocked By**: 3

  **References**:

  **Pattern References**:
  - `app/join-channel/page.tsx` - Join channel UI pattern
  - `hooks/contract/useBridgeCore.ts` - isChannelWhitelisted usage

  **API/Type References**:
  - `isChannelWhitelisted(channelId, address)` - Whitelist check (state < 2)
  - `getChannelParticipants(channelId)` - Participant list (state >= 2)

  **Acceptance Criteria**:

  ```bash
  # Agent uses playwright to:
  # 1. Enter channel ID where user IS whitelisted
  # 2. Verify "You are whitelisted" message
  # 3. Verify "Deposit to join" button visible
  
  # 4. Enter channel ID where user is NOT whitelisted
  # 5. Verify "Not whitelisted" message
  # 6. Verify no deposit button
  ```

  **Evidence to Capture**:
  - [ ] Screenshot: Whitelisted state
  - [ ] Screenshot: Not whitelisted state

  **Commit**: YES (groups with Task 4)
  - Message: `feat(extension): add channel join status check`
  - Files: `extension/src/components/JoinStatus.*`
  - Pre-commit: `cd extension && bun run build`

---

### Task 6: Deposit Flow

- [x] 6. Implement Token Deposit with MPT Key Generation

  **What to do**:
  - Token selector (from SUPPORTED_TOKENS)
  - Amount input with balance display
  - MPT Key generation (useGenerateMptKey pattern)
  - ERC20 approve transaction
  - depositToken transaction
  - Transaction status display
  - Store L2 account info temporarily (session only)

  **Must NOT do**:
  - Batch deposits
  - Custom token addresses
  - Key recovery features
  - Persist L2 private key

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex multi-step form with transactions
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Multi-step deposit UX

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 7, 8)
  - **Blocks**: 9
  - **Blocked By**: 4, 5

  **References**:

  **Pattern References**:
  - `hooks/useGenerateMptKey.ts:60-185` - Full MPT key generation hook
  - `lib/tokamakl2js.ts:deriveL2KeysAndAddressFromSignature` - Key derivation
  - `app/state-explorer/deposit/_hooks/useDeposit.ts` - Deposit hook pattern
  - `hooks/contract/useBridgeDepositManager.ts` - Deposit contract hook

  **API/Type References**:
  - `depositToken(channelId, amount, mptKey)` - BridgeDepositManager
  - `L2_PRV_KEY_MESSAGE` from `lib/l2KeyMessage.ts`

  **Acceptance Criteria**:

  ```bash
  # Agent uses playwright to:
  # 1. Select TON token
  # 2. Enter amount: 100
  # 3. Click "Generate MPT Key" → wallet sign popup
  # 4. Verify MPT key displayed (0x...)
  # 5. Click "Approve" → wallet tx popup
  # 6. Wait for approval confirmation
  # 7. Click "Deposit" → wallet tx popup
  # 8. Wait for deposit confirmation
  # 9. Verify success message

  # Contract verification:
  bun -e "
    // Verify deposit recorded
    const deposit = await client.readContract({
      functionName: 'getParticipantDeposit',
      args: [channelId, userAddress, tokenAddress]
    });
    console.log('Deposit:', deposit);
  "
  # Assert: deposit > 0
  ```

  **Evidence to Capture**:
  - [ ] Screenshot: Each step of deposit flow
  - [ ] Contract state after deposit

  **Commit**: YES
  - Message: `feat(extension): add token deposit flow with MPT key generation`
  - Files: `extension/src/pages/Deposit.*, extension/src/hooks/useDeposit.*`
  - Pre-commit: `cd extension && bun run build`

---

### Task 7: L2 Transaction Request

- [x] 7. Implement L2 Transaction Request to Leader Server

  **What to do**:
  - Recipient address input
  - Amount input (with L2 balance display from state snapshot)
  - Token selector
  - Sign L2 transaction (createERC20TransferTx)
  - Send to leader server API
  - Display result (proofId or error)
  - Handle WASM fallback if needed (from Task 0 result)

  **Must NOT do**:
  - Direct L2 execution without leader
  - Local proof generation
  - Transaction history (server manages)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Form with L2 signing and server communication
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Transaction request UX

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 6, 8)
  - **Blocks**: 8
  - **Blocked By**: 4

  **References**:

  **Pattern References**:
  - `lib/createERC20TransferTx.ts:35-66` - L2 transaction creation
  - `app/state-explorer/transaction/_hooks/useSynthesizer.ts` - Synthesizer API call pattern
  - `app/api/tokamak-zk-evm/route.ts` - Server API structure

  **API/Type References**:
  - Leader Server API: `POST /api/tokamak-zk-evm` with action: "synthesize"
  - Request body: `{ action: "synthesize", channelId, signedTxRlpStr, includeProof: true }`

  **Acceptance Criteria**:

  ```bash
  # Agent uses playwright to:
  # 1. Enter recipient: 0x742d35Cc6634C0532925a3b844Bc9e7595f8b2B0
  # 2. Enter amount: 10
  # 3. Click "Sign & Send"
  # 4. Verify wallet popup for L2 signature
  # 5. Verify "Sending to server..." status
  # 6. Verify success: "Proof ID: xxx" displayed

  # Server API verification:
  curl -X POST "${LEADER_URL}/api/tokamak-zk-evm" \
    -H "Content-Type: application/json" \
    -d '{"action":"synthesize","channelId":"0x...","signedTxRlpStr":"0x...","includeProof":true}'
  # Assert: Returns 200 with proofId or ZIP
  ```

  **Evidence to Capture**:
  - [ ] Screenshot: L2 tx form
  - [ ] Screenshot: Success with proofId
  - [ ] API response verification

  **Commit**: YES
  - Message: `feat(extension): add L2 transaction request to leader server`
  - Files: `extension/src/pages/Transaction.*, extension/src/hooks/useL2Transaction.*`
  - Pre-commit: `cd extension && bun run build`

---

### Task 8: Proof Viewer

- [ ] 8. Implement Proof List and Status Viewer

  **What to do**:
  - Fetch proofs from leader server API
  - Display proof list (proofKey, status, timestamp)
  - Show proof details (sender, recipient, amount, token)
  - Status filtering (submitted/verified/rejected)
  - Refresh button

  **Must NOT do**:
  - Proof approval/rejection (leader only)
  - Local proof verification
  - Proof file download

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: List UI with server data
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Proof list UX

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 6, 7)
  - **Blocks**: 9
  - **Blocked By**: 7

  **References**:

  **Pattern References**:
  - `app/state-explorer/transaction/_components/ProofList.tsx` - Proof list UI pattern
  - `app/state-explorer/transaction/_components/ProofListItem.tsx` - Proof item display

  **API/Type References**:
  - Leader Server API: `GET /api/channels/{channelId}/proofs?type=submitted`
  - Proof object structure from `lib/db/channels.ts`

  **Acceptance Criteria**:

  ```bash
  # Server API verification:
  curl "${LEADER_URL}/api/channels/${CHANNEL_ID}/proofs?type=submitted"
  # Assert: Returns array of proof objects
  
  # Agent uses playwright to:
  # 1. Navigate to Proofs tab
  # 2. Verify proof list loads
  # 3. Click on a proof item
  # 4. Verify details modal shows sender, recipient, amount
  # 5. Filter by "verified"
  # 6. Verify filtered list
  ```

  **Evidence to Capture**:
  - [ ] Screenshot: Proof list
  - [ ] Screenshot: Proof details modal
  - [ ] API response sample

  **Commit**: YES
  - Message: `feat(extension): add proof list and viewer`
  - Files: `extension/src/pages/Proofs.*, extension/src/components/ProofList.*`
  - Pre-commit: `cd extension && bun run build`

---

### Task 9: Withdraw Flow

- [ ] 9. Implement Token Withdrawal

  **What to do**:
  - Check withdrawable amount from contract
  - Display withdrawable amounts per token
  - Withdraw button per token
  - Execute withdraw transaction
  - Show transaction status

  **Must NOT do**:
  - Partial withdrawal
  - Batch withdrawal
  - Pre-channel-close withdrawal

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Withdrawal UI with contract interaction
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Withdrawal UX

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Wave 3
  - **Blocks**: 10
  - **Blocked By**: 6, 8

  **References**:

  **Pattern References**:
  - `app/state-explorer/withdraw/page.tsx` - Withdraw UI pattern
  - `hooks/contract/useBridgeWithdrawManager.ts` - Withdraw hook

  **API/Type References**:
  - `getWithdrawableAmount(channelId, user, token)` - BridgeWithdrawManager
  - `withdraw(channelId, token)` - BridgeWithdrawManager

  **Acceptance Criteria**:

  ```bash
  # Contract verification:
  bun -e "
    const amount = await client.readContract({
      functionName: 'getWithdrawableAmount',
      args: [channelId, userAddress, tokenAddress]
    });
    console.log('Withdrawable:', amount);
  "
  # Assert: Returns withdrawable amount (after channel closed)
  
  # Agent uses playwright to:
  # 1. Navigate to Withdraw tab
  # 2. Verify withdrawable amounts displayed
  # 3. Click "Withdraw" on TON row
  # 4. Verify wallet tx popup
  # 5. Wait for confirmation
  # 6. Verify success message
  # 7. Verify withdrawable amount is now 0
  ```

  **Evidence to Capture**:
  - [ ] Screenshot: Withdraw page with amounts
  - [ ] Screenshot: Success after withdrawal
  - [ ] Contract state verification

  **Commit**: YES
  - Message: `feat(extension): add token withdrawal flow`
  - Files: `extension/src/pages/Withdraw.*, extension/src/hooks/useWithdraw.*`
  - Pre-commit: `cd extension && bun run build`

---

### Task 10: Polish & Production Build

- [ ] 10. Final Polish and Production Build

  **What to do**:
  - Error handling for all API calls
  - Loading states for all async operations (skeleton loaders, spinners)
  - Connection status indicator (server, RPC) - MetaMask style dot indicator
  - Popup sizing optimization (360px width, smooth scrolling)
  - Icon design (16x16, 48x48, 128x128) - Tokamak branding with wallet feel
  - Micro-interactions and transitions (slide transitions between pages)
  - Production build optimization
  - Remove all console.log statements
  - Write README for extension usage
  - Toast notifications for transaction status

  **Must NOT do**:
  - New features
  - Automated testing setup
  - CI/CD pipeline
  - Light theme (dark only for MVP)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI polish and production prep
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Final polish

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Final
  - **Blocks**: None
  - **Blocked By**: 9

  **References**:

  **Pattern References**:
  - `components/ui/*.tsx` - UI component patterns
  - Existing error handling patterns in the codebase

  **External References**:
  - Chrome Extension Icons: https://developer.chrome.com/docs/extensions/mv3/manifest/icons/

  **Acceptance Criteria**:

  ```bash
  # Production build:
  cd extension && bun run build
  # Assert: No errors, no warnings
  
  ls -la extension/dist/
  # Assert: All files present
  # Assert: icons/icon-16.png, icon-48.png, icon-128.png exist
  
  # Size check:
  du -sh extension/dist/
  # Assert: < 5MB total
  
  # Agent uses playwright to:
  # 1. Load production build
  # 2. Verify all features work
  # 3. Verify error states show user-friendly messages
  # 4. Verify loading states appear during operations
  ```

  **Evidence to Capture**:
  - [ ] Build output (no errors/warnings)
  - [ ] Final extension size
  - [ ] Screenshots of polished UI

  **Commit**: YES
  - Message: `feat(extension): polish UI and prepare production build`
  - Files: `extension/*`
  - Pre-commit: `cd extension && bun run build`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 0 | `test(extension): verify WASM compatibility` | `extension/test-wasm/*` | Manual test |
| 1 | `feat(extension): scaffold Chrome Extension` | `extension/*` | `bun run build` |
| 2 | `feat(extension): add MetaMask wallet connection` | `extension/src/providers/*, components/*` | `bun run build` |
| 3 | `feat(extension): add settings page` | `extension/src/pages/Settings.*` | `bun run build` |
| 4 | `feat(extension): add channel dashboard` | `extension/src/pages/Dashboard.*` | `bun run build` |
| 5 | `feat(extension): add channel join status` | `extension/src/components/JoinStatus.*` | `bun run build` |
| 6 | `feat(extension): add deposit flow` | `extension/src/pages/Deposit.*` | `bun run build` |
| 7 | `feat(extension): add L2 transaction request` | `extension/src/pages/Transaction.*` | `bun run build` |
| 8 | `feat(extension): add proof viewer` | `extension/src/pages/Proofs.*` | `bun run build` |
| 9 | `feat(extension): add withdrawal flow` | `extension/src/pages/Withdraw.*` | `bun run build` |
| 10 | `feat(extension): polish and production build` | `extension/*` | `bun run build` |

---

## Success Criteria

### Verification Commands

```bash
# Build verification
cd extension && bun run build && echo "BUILD OK"

# Extension loads in Chrome
# (Manual: chrome://extensions → Load unpacked → extension/dist/)

# Full flow test with playwright
bun run test:extension
```

### Final Checklist

- [ ] Extension builds without errors
- [ ] MetaMask connection works
- [ ] RPC URL configurable and persisted
- [ ] Leader Server URL configurable and persisted
- [ ] Channel info displays correctly
- [ ] Whitelist status shows correctly
- [ ] Deposit flow completes (approve + deposit)
- [ ] L2 transaction request succeeds
- [ ] Proof list displays from server
- [ ] Withdrawal completes
- [ ] All "Must NOT Have" items confirmed absent
- [ ] Extension size < 5MB
- [ ] No console errors in production build
