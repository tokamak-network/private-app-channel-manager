# Chrome Extension Manual Test Checklist

## Prerequisites

### 1. Environment Setup
- [ ] MetaMask installed in Chrome with Sepolia testnet configured
- [ ] Test wallet has Sepolia ETH (for gas) and TON tokens
- [ ] Web app (leader server) running on `http://localhost:3000`

### 2. Extension Installation
```bash
cd extension
bun install
bun run build
```
- [ ] Load extension: `chrome://extensions/` → Developer mode → Load unpacked → Select `extension/dist/`
- [ ] Extension icon visible in Chrome toolbar

### 3. Web App Setup
```bash
# In project root (not extension folder)
npm run dev
```
- [ ] Web app accessible at `http://localhost:3000`

---

## Test Cases

### TC-01: Extension Basic Load
**Steps:**
1. Click extension icon in Chrome toolbar

**Expected:**
- [ ] Popup opens (360×600 max)
- [ ] "Connect Wallet" button visible
- [ ] MetaMask-style dark theme applied

---

### TC-02: Wallet Connection
**Steps:**
1. Click "Connect Wallet" button
2. Approve MetaMask connection

**Expected:**
- [ ] MetaMask popup appears
- [ ] After approval, wallet address shown (truncated: `0x1234...5678`)
- [ ] Bottom navigation tabs appear (Home, Send, Activity, Settings)

---

### TC-03: Settings Configuration
**Steps:**
1. Navigate to Settings tab
2. Enter RPC URL: `https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY`
3. Enter Leader Server URL: `http://localhost:3000`
4. Click Save

**Expected:**
- [ ] Settings saved (persists after popup close/reopen)
- [ ] Toast/confirmation shown

---

### TC-04: Channel ID Input (No Channel)
**Steps:**
1. Navigate to Home tab
2. Enter invalid channel ID: `0x0000000000000000000000000000000000000000000000000000000000000000`

**Expected:**
- [ ] Error or "Channel not found" message
- [ ] No crash

---

### TC-05: Channel Dashboard (Valid Channel)
**Prerequisite:** Have a valid channel ID from web app

**Steps:**
1. Navigate to Home tab
2. Enter valid channel ID from web app
3. Wait for data load

**Expected:**
- [ ] Channel State displayed (Initialized/Open/Closing/Closed)
- [ ] Participant count shown
- [ ] Leader address shown
- [ ] Your participation status shown (Participant/Not Participant/Leader)

**Test Channel IDs (from local DB):**
- `0x6c293fecc2e919d244eb1567b3962c86b9fc8d6ecaf2a94fdc0d02151151b57e`
- `0xda5340c9623420cc4da777930f46e93e6beea49bc195a727372032d69bea068e`

---

### TC-06: Join Channel (Whitelist Check)
**Prerequisite:** Channel in Initialized state, wallet on whitelist

**Steps:**
1. View channel where your wallet is whitelisted
2. Check participation status

**Expected:**
- [ ] If whitelisted: "You can join" or deposit button visible
- [ ] If not whitelisted: "Not on whitelist" message

---

### TC-07: Token Deposit Flow
**Prerequisite:** 
- Channel in Initialized state (state=1)
- Your wallet is whitelisted
- You have TON tokens in wallet

**Steps:**
1. Click Deposit button on Home
2. **Step 1**: Click "Generate MPT Key" → Sign MetaMask message
3. **Step 2**: Enter deposit amount → Approve token spend
4. **Step 3**: Confirm deposit transaction

**Expected:**
- [ ] MPT key generated from signature
- [ ] Token approval transaction succeeds
- [ ] Deposit transaction succeeds
- [ ] Balance updated on dashboard

---

### TC-08: L2 Transaction (Send)
**Prerequisite:** Channel in Open state (state=2)

**Steps:**
1. Navigate to Send tab
2. Enter recipient address (another participant's L2 address)
3. Enter amount
4. Click Send → Sign transaction

**Expected:**
- [ ] L2 transaction signed with wallet
- [ ] Request sent to leader server (`POST /api/tokamak-zk-evm`)
- [ ] Success message shown
- [ ] Navigate to Activity tab to see proof

---

### TC-09: Proof List (Activity)
**Prerequisite:** Have submitted L2 transactions

**Steps:**
1. Navigate to Activity tab
2. Wait for proofs to load

**Expected:**
- [ ] Proofs listed from leader server
- [ ] Each proof shows: status (pending/approved/rejected), amount, timestamp
- [ ] Auto-refresh every 30 seconds (or manual refresh button)

---

### TC-10: Withdrawal Flow
**Prerequisite:** Channel in Closed state (state=4)

**Steps:**
1. Navigate to Home tab
2. Click Withdraw button
3. View withdrawable balance
4. Confirm withdrawal transaction

**Expected:**
- [ ] Withdrawable amount shown
- [ ] Withdrawal transaction succeeds
- [ ] Balance updated

---

### TC-11: Network Switching
**Steps:**
1. Switch MetaMask to wrong network (e.g., Ethereum Mainnet)
2. Try to perform action

**Expected:**
- [ ] Warning message about wrong network
- [ ] Prompt to switch to Sepolia
- [ ] Actions blocked until correct network

---

### TC-12: Disconnect Wallet
**Steps:**
1. Click wallet address/disconnect button
2. Confirm disconnect

**Expected:**
- [ ] Wallet disconnected
- [ ] Returns to "Connect Wallet" state
- [ ] Settings preserved

---

## Edge Cases

### EC-01: Leader Server Offline
**Steps:**
1. Stop web app (`Ctrl+C`)
2. Try to send L2 transaction or view proofs

**Expected:**
- [ ] Error message about server unreachable
- [ ] No crash, graceful handling

---

### EC-02: RPC URL Invalid
**Steps:**
1. Enter invalid RPC URL in Settings
2. Try to view channel info

**Expected:**
- [ ] Error message about RPC connection
- [ ] Suggestion to check settings

---

### EC-03: Large Channel ID
**Steps:**
1. Enter very long string as channel ID

**Expected:**
- [ ] Validation error or truncation
- [ ] No crash

---

## Test Results Summary

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-01 | ⬜ | |
| TC-02 | ⬜ | |
| TC-03 | ⬜ | |
| TC-04 | ⬜ | |
| TC-05 | ⬜ | |
| TC-06 | ⬜ | |
| TC-07 | ⬜ | |
| TC-08 | ⬜ | |
| TC-09 | ⬜ | |
| TC-10 | ⬜ | |
| TC-11 | ⬜ | |
| TC-12 | ⬜ | |
| EC-01 | ⬜ | |
| EC-02 | ⬜ | |
| EC-03 | ⬜ | |

**Legend:** ⬜ Not tested | ✅ Passed | ❌ Failed | ⚠️ Partial

---

## Reporting Issues

If a test fails, document:
1. **Test Case ID**: e.g., TC-07
2. **Steps to Reproduce**: Exact steps taken
3. **Expected Result**: What should happen
4. **Actual Result**: What actually happened
5. **Screenshot**: If applicable
6. **Console Errors**: Check extension popup console (`Right-click popup → Inspect`)
