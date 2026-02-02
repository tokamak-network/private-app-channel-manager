# MetaMask Snap Interactive Menu Implementation

## TL;DR

> **Quick Summary**: Transform the Snap's static `onHomePage` into an interactive menu with 7 buttons (Settings, Dashboard, Deposit, Send, Withdraw, Activity). Use `snap_createInterface` + `onUserInput` for navigation, and `endowment:ethereum-provider` for L1 transactions (Deposit/Withdraw).
> 
> **Deliverables**:
> - Interactive menu UI with 7 functional buttons
> - View navigation system (menu ↔ subviews)
> - Settings forms (Channel ID, Server URL)
> - Dashboard view (channel info from RPC)
> - Deposit form + L1 contract call via ethereum provider
> - Send form + L2 transfer via Leader Server API
> - Withdraw form + L1 contract call via ethereum provider
> - Activity view (transaction history from Server API)
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 2 → Tasks 3-8 (parallel) → Task 9

---

## Context

### Original Request
User wants to change the Snap's `onHomePage` from showing channel info directly to showing an interactive menu with buttons first.

### Interview Summary
**Key Discussions**:
- 7 menu buttons needed: Set Channel ID, Set Server URL, View Dashboard, Deposit, Send, Withdraw, Activity
- Transactions via Leader Server API for L2, direct ethereum provider for L1
- Buttons should be disabled if server URL not configured
- Manual testing in MetaMask Flask

**Research Findings**:
- `endowment:ethereum-provider` permission allows Snap to call `eth_sendTransaction` directly
- `snap_createInterface` + `onUserInput` enables interactive homepage
- `snap_updateInterface` allows view navigation within same interface

### Metis Review
**Identified Gaps** (addressed):
- Initially thought L1 tx impossible from Snap → Found `endowment:ethereum-provider` solution
- Leader Server API specification unclear → Will use existing `/api/channels` endpoints + new L2 transfer endpoint
- Button enable/disable logic based on server URL connectivity

---

## Work Objectives

### Core Objective
Transform Snap's static homepage into a fully interactive application with menu navigation, settings forms, and transaction capabilities.

### Concrete Deliverables
- `snap/packages/snap/src/index.tsx` - Rewritten with interactive UI
- `snap/packages/snap/snap.manifest.json` - Updated permissions
- 7 working menu buttons with corresponding views/forms
- L1 transaction execution (Deposit/Withdraw) via MetaMask signing popup
- L2 transaction execution (Send) via Leader Server API

### Definition of Done
- [ ] Open Snap in MetaMask Flask → see 7-button menu
- [ ] Each button navigates to its view
- [ ] Back button returns to menu from any view
- [ ] Deposit/Withdraw triggers MetaMask signing popup
- [ ] Send calls Leader Server API
- [ ] Activity shows transaction history

### Must Have
- Interactive menu with all 7 buttons
- View navigation with back buttons
- Settings persistence via `snap_manageState`
- Error handling with user-friendly messages
- Loading states during async operations

### Must NOT Have (Guardrails)
- Multiple token support (use channel's configured token only)
- Multi-channel switching UI (one channel via settings)
- Transaction batching (single tx per action)
- Push notifications (manual refresh only)
- Offline support / transaction queuing
- Dark mode / custom theming

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (Snap testing is complex)
- **User wants tests**: Manual-only
- **Framework**: Manual testing in MetaMask Flask

### Automated Verification (Agent-Executable)

**Verification Method**: Agent uses interactive_bash (tmux) to build Snap, then uses playwright skill to test at localhost:8000

**Pre-test Setup:**
```bash
# In tmux session
cd /Users/son-yeongseong/Desktop/dev/private-app-channel-manager/snap
yarn build
yarn start
# Keep running for tests
```

**Test Site Verification** (via playwright):
1. Navigate to http://localhost:8000
2. Connect wallet
3. Install/Update Snap
4. Open MetaMask Flask → Settings → Snaps → Tokamak Channels
5. Verify menu appears

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: Add permissions to manifest

Wave 2 (After Wave 1):
├── Task 2: Core infrastructure (onHomePage + onUserInput + Menu UI)

Wave 3 (After Wave 2 - All Parallel):
├── Task 3: Settings views (Channel ID + Server URL)
├── Task 4: Dashboard view
├── Task 5: Deposit view + L1 tx
├── Task 6: Send view + L2 tx
├── Task 7: Withdraw view + L1 tx
├── Task 8: Activity view

Wave 4 (After Wave 3):
└── Task 9: Integration testing & polish

Critical Path: Task 1 → Task 2 → Task 5 → Task 9
Parallel Speedup: ~50% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2-8 | None |
| 2 | 1 | 3-8 | None |
| 3 | 2 | 9 | 4, 5, 6, 7, 8 |
| 4 | 2 | 9 | 3, 5, 6, 7, 8 |
| 5 | 2 | 9 | 3, 4, 6, 7, 8 |
| 6 | 2 | 9 | 3, 4, 5, 7, 8 |
| 7 | 2 | 9 | 3, 4, 5, 6, 8 |
| 8 | 2 | 9 | 3, 4, 5, 6, 7 |
| 9 | 3-8 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1 | delegate_task(category="quick", ...) |
| 2 | 2 | delegate_task(category="unspecified-high", ...) |
| 3 | 3-8 | dispatch 6 agents in parallel |
| 4 | 9 | delegate_task(category="quick", load_skills=["playwright"], ...) |

---

## TODOs

- [ ] 1. Update snap.manifest.json with new permissions

  **What to do**:
  - Add `endowment:ethereum-provider` permission for L1 transactions
  - Verify existing permissions are retained
  - Rebuild snap to update shasum

  **Must NOT do**:
  - Remove existing permissions
  - Change snap metadata

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit, simple JSON modification
  - **Skills**: `[]`
    - No special skills needed for JSON editing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2-8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `snap/packages/snap/snap.manifest.json:19-28` - Current initialPermissions structure

  **Documentation References**:
  - MetaMask Docs: `endowment:ethereum-provider` permission allows Snap to access `ethereum` global for signing

  **Acceptance Criteria**:

  ```bash
  # Agent runs:
  cat snap/packages/snap/snap.manifest.json | grep -A 20 "initialPermissions"
  # Assert: Contains "endowment:ethereum-provider": {}
  # Assert: Contains "endowment:page-home": {}
  # Assert: Contains "snap_dialog": {}
  # Assert: Contains "snap_manageState": {}
  # Assert: Contains "endowment:network-access": {}
  ```

  **Evidence to Capture:**
  - [ ] Terminal output showing updated manifest content

  **Commit**: YES
  - Message: `feat(snap): add ethereum-provider permission for L1 transactions`
  - Files: `snap/packages/snap/snap.manifest.json`
  - Pre-commit: `cd snap && yarn build`

---

- [ ] 2. Implement core interactive infrastructure (onHomePage + onUserInput + Menu)

  **What to do**:
  - Import new types: `OnUserInputHandler`, `UserInputEventType`
  - Import new JSX components: `Button`, `Container`, `Footer`, `Section`, `Icon`
  - Create `MainMenu` component with 7 buttons:
    - `set-channel-id` - Set Channel ID
    - `set-server-url` - Set Server URL
    - `view-dashboard` - View Dashboard
    - `deposit` - Deposit
    - `send` - Send
    - `withdraw` - Withdraw
    - `activity` - Activity
  - Modify `onHomePage` to:
    - Check settings (channelId, serverUrl)
    - Create interface with `snap_createInterface`
    - Return `{ id: interfaceId }`
  - Add `onUserInput` export handler:
    - Handle `ButtonClickEvent` for menu buttons
    - Use `snap_updateInterface` for navigation
    - Add placeholder views for each button (will be implemented in Tasks 3-8)
  - Add "Back to Menu" button pattern for all subviews

  **Must NOT do**:
  - Implement full functionality of subviews (just placeholders)
  - Remove existing RPC handlers (keep for dApp compatibility)
  - Add complex state management

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core infrastructure change requiring careful TypeScript work and understanding of Snap SDK patterns
  - **Skills**: `[]`
    - No browser skills needed, pure code implementation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: Tasks 3, 4, 5, 6, 7, 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `snap/packages/snap/src/index.tsx:1-12` - Current imports to extend
  - `snap/packages/snap/src/index.tsx:334-396` - Current onHomePage to replace
  - `snap/packages/snap/src/index.tsx:32-51` - getSettings/saveSettings pattern to reuse

  **API/Type References**:
  - `@metamask/snaps-sdk` - `OnUserInputHandler`, `UserInputEventType.ButtonClickEvent`
  - `@metamask/snaps-sdk/jsx` - `Button`, `Container`, `Footer`, `Section`, `Icon`

  **Documentation References**:
  - MetaMask Docs: `snap_createInterface` returns interfaceId for interactive UI
  - MetaMask Docs: `onHomePage` can return `{ id: interfaceId }` instead of `{ content: ... }`
  - MetaMask Docs: `snap_updateInterface` updates existing interface without closing

  **WHY Each Reference Matters**:
  - Lines 1-12: Shows current import pattern to extend with new SDK types
  - Lines 334-396: The exact code being replaced - shows current static pattern
  - Lines 32-51: Settings pattern to check before showing menu

  **Acceptance Criteria**:

  ```bash
  # Agent runs:
  grep -c "OnUserInputHandler" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more
  
  grep -c "snap_createInterface" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more
  
  grep -c "snap_updateInterface" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more
  
  grep -c "export const onUserInput" snap/packages/snap/src/index.tsx
  # Assert: Output is 1
  
  # Build verification
  cd snap && yarn build
  # Assert: Exit code 0, no TypeScript errors
  ```

  **Evidence to Capture:**
  - [ ] Build output showing successful compilation
  - [ ] Grep counts confirming new patterns added

  **Commit**: YES
  - Message: `feat(snap): implement interactive menu infrastructure with onUserInput handler`
  - Files: `snap/packages/snap/src/index.tsx`
  - Pre-commit: `cd snap && yarn build`

---

- [ ] 3. Implement Settings views (Set Channel ID + Set Server URL)

  **What to do**:
  - Create `ChannelIdSettingView` component:
    - Show current channelId if set
    - Input field for new channelId (0x + 64 hex chars)
    - Submit button
    - Back button
  - Create `ServerUrlSettingView` component:
    - Show current serverUrl if set
    - Input field for new URL
    - Submit button
    - Back button
  - Handle `FormSubmitEvent` in `onUserInput`:
    - Validate channelId format (0x + 64 hex)
    - Save to settings via `snap_manageState`
    - Show success/error feedback
    - Navigate back to menu
  - Update menu button handlers to show these views

  **Must NOT do**:
  - Add URL connectivity check during save (just save the URL)
  - Add complex validation beyond format check

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward form implementation following established patterns
  - **Skills**: `[]`
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 4, 5, 6, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `snap/packages/snap/src/index.tsx:254-279` - Existing configureSettings RPC handler (prompt-based) as reference
  - `snap/packages/snap/src/index.tsx:43-51` - saveSettings function to reuse

  **Documentation References**:
  - MetaMask Docs: `Form`, `Field`, `Input` components for form UI
  - MetaMask Docs: `FormSubmitEvent` event type with `value` object

  **WHY Each Reference Matters**:
  - Lines 254-279: Shows current validation logic (0x prefix, 66 chars total)
  - Lines 43-51: The exact save function to call

  **Acceptance Criteria**:

  ```bash
  # Agent runs:
  grep -c "ChannelIdSettingView\|ServerUrlSettingView" snap/packages/snap/src/index.tsx
  # Assert: Output is 2 or more (view definitions)
  
  grep -c "FormSubmitEvent" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more
  
  cd snap && yarn build
  # Assert: Exit code 0
  ```

  **Evidence to Capture:**
  - [ ] Build output confirming compilation

  **Commit**: YES (group with Task 4 if in same session)
  - Message: `feat(snap): add settings views for Channel ID and Server URL`
  - Files: `snap/packages/snap/src/index.tsx`
  - Pre-commit: `cd snap && yarn build`

---

- [ ] 4. Implement Dashboard view

  **What to do**:
  - Create `DashboardView` component:
    - Reuse existing channel info display pattern
    - Show: Channel ID (truncated), Status, Participants, Token, Leader, Server URL
    - Back button
  - Modify navigation to load channel info before showing view:
    - Show loading state while fetching
    - Handle errors gracefully
    - Cache info in context if needed

  **Must NOT do**:
  - Add refresh button (user can go back and re-enter)
  - Add additional data beyond what's currently shown

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mostly reusing existing code from static homepage
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 3, 5, 6, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `snap/packages/snap/src/index.tsx:350-378` - Current dashboard display to reuse
  - `snap/packages/snap/src/index.tsx:156-165` - getChannelInfo function

  **WHY Each Reference Matters**:
  - Lines 350-378: Exact JSX to extract and adapt for view component
  - Lines 156-165: Async function to call for data

  **Acceptance Criteria**:

  ```bash
  # Agent runs:
  grep -c "DashboardView" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more
  
  cd snap && yarn build
  # Assert: Exit code 0
  ```

  **Commit**: YES (group with Task 3)
  - Message: `feat(snap): add Dashboard view with channel info display`
  - Files: `snap/packages/snap/src/index.tsx`
  - Pre-commit: `cd snap && yarn build`

---

- [ ] 5. Implement Deposit view with L1 transaction

  **What to do**:
  - Create `DepositView` component:
    - Show current channel info (ID, token)
    - Amount input field
    - Deposit button
    - Back button
  - Implement deposit transaction:
    - Get user's wallet address via `ethereum.request({ method: 'eth_accounts' })`
    - Encode `depositToken(channelId, amount, mptKey)` call data
    - Call `ethereum.request({ method: 'eth_sendTransaction', params: [...] })`
    - This triggers MetaMask signing popup
    - Show success/error result
  - Add loading state during transaction
  - Handle user rejection gracefully

  **Must NOT do**:
  - Implement MPT key generation (use hardcoded or prompt user)
  - Add token approval flow (assume pre-approved)
  - Wait for transaction confirmation (show tx hash and return)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: L1 transaction encoding requires careful ABI work
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 3, 4, 6, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `snap/packages/snap/src/index.tsx:53-78` - rpcCall pattern for reference
  - `snap/packages/snap/src/index.tsx:80-86` - encodeBytes32 utility

  **API/Type References**:
  - BridgeDepositManager contract: `depositToken(bytes32 channelId, uint256 amount, bytes32 mptKey)`
  - Contract address: See `packages/config/src/contracts/addresses.ts`

  **External References**:
  - MetaMask Docs: `ethereum.request({ method: 'eth_sendTransaction' })` pattern

  **WHY Each Reference Matters**:
  - Lines 53-78: Shows fetch pattern, but we'll use `ethereum` global instead
  - Lines 80-86: Utility to encode channelId parameter

  **Acceptance Criteria**:

  ```bash
  # Agent runs:
  grep -c "DepositView" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more
  
  grep -c "eth_sendTransaction" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more (deposit transaction)
  
  grep -c "depositToken" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more (function selector encoding)
  
  cd snap && yarn build
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(snap): add Deposit view with L1 transaction via ethereum provider`
  - Files: `snap/packages/snap/src/index.tsx`
  - Pre-commit: `cd snap && yarn build`

---

- [ ] 6. Implement Send view with L2 transfer via Leader Server

  **What to do**:
  - Create `SendView` component:
    - Recipient address input
    - Amount input
    - Send button
    - Back button
  - Check if serverUrl is configured:
    - If not, show "Configure Server URL first" message
    - Disable send button
  - Implement L2 transfer:
    - Call Leader Server API: `POST {serverUrl}/api/transfer`
    - Body: `{ channelId, to, amount, signature }`
    - Signature: Sign the transfer data with user's wallet
    - Show success/error result

  **Must NOT do**:
  - Implement complex retry logic
  - Add address book / contacts

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires signing + API integration
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 3, 4, 5, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `snap/packages/snap/src/index.tsx:53-78` - fetch pattern for API calls
  - `lib/createERC20TransferTx.ts` - L2 transfer signing pattern (web app reference)

  **Documentation References**:
  - MetaMask Docs: `ethereum.request({ method: 'personal_sign' })` for message signing

  **WHY Each Reference Matters**:
  - Lines 53-78: fetch() pattern to adapt for server API call
  - createERC20TransferTx: Shows what data needs signing for L2 transfer

  **Acceptance Criteria**:

  ```bash
  # Agent runs:
  grep -c "SendView" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more
  
  grep -c "personal_sign\|eth_signTypedData" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more (signing for L2 tx)
  
  cd snap && yarn build
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(snap): add Send view with L2 transfer via Leader Server API`
  - Files: `snap/packages/snap/src/index.tsx`
  - Pre-commit: `cd snap && yarn build`

---

- [ ] 7. Implement Withdraw view with L1 transaction

  **What to do**:
  - Create `WithdrawView` component:
    - Show withdrawable amount (from contract)
    - Withdraw button
    - Back button
  - Query withdrawable amount:
    - Call `getWithdrawableAmount(channelId, userAddress, tokenAddress)` via eth_call
  - Implement withdraw transaction:
    - Encode `withdraw(channelId, tokenAddress)` call data
    - Call `ethereum.request({ method: 'eth_sendTransaction' })`
    - Show tx hash on success

  **Must NOT do**:
  - Add partial withdrawal (withdraw all)
  - Wait for confirmation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Similar to Deposit - L1 transaction encoding
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 3, 4, 5, 6, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - Task 5 (Deposit) - Same L1 transaction pattern
  - `snap/packages/snap/src/index.tsx:88-96` - getChannelState pattern for contract reads

  **API/Type References**:
  - BridgeWithdrawManager: `withdraw(bytes32 channelId, address token)`
  - BridgeWithdrawManager: `getWithdrawableAmount(bytes32 channelId, address user, address token)`

  **Acceptance Criteria**:

  ```bash
  # Agent runs:
  grep -c "WithdrawView" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more
  
  grep -c "getWithdrawableAmount\|withdraw" snap/packages/snap/src/index.tsx
  # Assert: Output is 2 or more (query + tx)
  
  cd snap && yarn build
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(snap): add Withdraw view with L1 transaction`
  - Files: `snap/packages/snap/src/index.tsx`
  - Pre-commit: `cd snap && yarn build`

---

- [ ] 8. Implement Activity view (transaction history)

  **What to do**:
  - Create `ActivityView` component:
    - Show list of recent transactions
    - Each item: type (deposit/send/withdraw), amount, timestamp, status
    - Back button
  - Data source:
    - If serverUrl configured: fetch from `{serverUrl}/api/channels/{channelId}/proofs`
    - If not: show "Configure Server URL to see activity"
  - Display last 10 transactions max

  **Must NOT do**:
  - Add pagination
  - Add filtering
  - Add detail view per transaction

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple list display with API fetch
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 3, 4, 5, 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `snap/packages/snap/src/index.tsx:53-78` - fetch pattern

  **API/Type References**:
  - `app/api/channels/[id]/proofs/route.ts` - Existing proofs API endpoint

  **Acceptance Criteria**:

  ```bash
  # Agent runs:
  grep -c "ActivityView" snap/packages/snap/src/index.tsx
  # Assert: Output is 1 or more
  
  cd snap && yarn build
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(snap): add Activity view with transaction history`
  - Files: `snap/packages/snap/src/index.tsx`
  - Pre-commit: `cd snap && yarn build`

---

- [ ] 9. Integration testing and polish

  **What to do**:
  - Build and start Snap dev server
  - Test in MetaMask Flask:
    - Menu displays with all 7 buttons
    - Settings views work (save/load)
    - Dashboard shows channel info
    - Deposit triggers MetaMask popup
    - Send requires server URL
    - Withdraw triggers MetaMask popup
    - Activity shows history (or configure message)
  - Fix any integration issues found
  - Clean up console.log statements
  - Ensure error messages are user-friendly

  **Must NOT do**:
  - Add new features
  - Major refactoring

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Testing and minor fixes
  - **Skills**: `["playwright"]`
    - For browser automation testing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (solo - final)
  - **Blocks**: None (completion)
  - **Blocked By**: Tasks 3, 4, 5, 6, 7, 8

  **References**:

  **Pattern References**:
  - All previous tasks' code

  **Test References**:
  - `snap/packages/site/src/pages/index.tsx` - Test site buttons

  **Acceptance Criteria**:

  **Using playwright skill for automated browser testing:**
  ```
  # Agent executes via playwright browser automation:
  1. Navigate to: http://localhost:8000
  2. Click: "Connect" button
  3. Approve MetaMask Flask connection
  4. Click: "Install Snap" or "Update Snap"
  5. Navigate to: MetaMask Flask → Settings → Snaps → Tokamak Channels
  6. Verify: Menu with 7 buttons visible
  7. Click: "Set Channel ID" button
  8. Verify: Input form appears
  9. Enter: Test channel ID
  10. Click: Submit
  11. Verify: Returns to menu
  12. Click: "View Dashboard"
  13. Verify: Channel info displayed
  14. Screenshot: .sisyphus/evidence/task-9-menu.png
  15. Screenshot: .sisyphus/evidence/task-9-dashboard.png
  ```

  **For L1 transaction testing (Deposit):**
  ```
  # Agent executes:
  1. From menu, click "Deposit"
  2. Enter amount: "0.001"
  3. Click "Deposit" button
  4. Verify: MetaMask signing popup appears
  5. Screenshot: .sisyphus/evidence/task-9-deposit-popup.png
  6. Reject transaction (don't spend real tokens)
  7. Verify: Error message about rejection shown
  ```

  **Evidence to Capture:**
  - [ ] Screenshot of menu with 7 buttons
  - [ ] Screenshot of dashboard view
  - [ ] Screenshot of MetaMask signing popup (deposit)
  - [ ] Terminal output from `yarn build` showing no errors

  **Commit**: YES
  - Message: `feat(snap): complete interactive menu with all features`
  - Files: `snap/packages/snap/src/index.tsx` (if fixes made)
  - Pre-commit: `cd snap && yarn build`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(snap): add ethereum-provider permission` | snap.manifest.json | yarn build |
| 2 | `feat(snap): implement interactive menu infrastructure` | index.tsx | yarn build |
| 3+4 | `feat(snap): add settings and dashboard views` | index.tsx | yarn build |
| 5 | `feat(snap): add deposit with L1 transaction` | index.tsx | yarn build |
| 6 | `feat(snap): add send with L2 transfer` | index.tsx | yarn build |
| 7 | `feat(snap): add withdraw with L1 transaction` | index.tsx | yarn build |
| 8 | `feat(snap): add activity view` | index.tsx | yarn build |
| 9 | `feat(snap): complete interactive menu (integration fixes)` | index.tsx | manual test |

---

## Success Criteria

### Verification Commands
```bash
cd snap && yarn build  # Expected: exit 0, no errors
cd snap && yarn start  # Expected: servers start on :8000 and :8080
```

### Final Checklist
- [ ] All 7 menu buttons present and clickable
- [ ] Settings persist across Snap restarts
- [ ] Dashboard loads channel info correctly
- [ ] Deposit triggers MetaMask signing popup
- [ ] Send works with configured server (or shows configure message)
- [ ] Withdraw triggers MetaMask signing popup
- [ ] Activity shows history (or configure message)
- [ ] Back buttons work from all views
- [ ] Error states show user-friendly messages
- [ ] Loading states appear during async operations
- [ ] No TypeScript errors in build
