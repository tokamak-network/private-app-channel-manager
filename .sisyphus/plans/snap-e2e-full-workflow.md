# Snap E2E Full Workflow Test Plan

## Goal
MetaMask Flask에 설치된 실제 지갑을 활용하여 Tokamak Channels Snap의 전체 UI/UX 워크플로우를 E2E 테스트합니다.

## Test Workflow

1. **Connect & Install Snap** - 테스트 사이트에서 MetaMask 연결 및 Snap 설치
2. **Set Channel ID** - 채널 ID 설정 및 저장 확인
3. **Set Server URL** - 리더 서버 URL 설정
4. **View Dashboard** - 채널 정보 조회 (상태, 참가자, 토큰, 리더)
5. **Deposit Flow** - MPT Key 자동 생성 + Deposit 트랜잭션 (서명 확인)
6. **Activity View** - 트랜잭션 히스토리 확인

## Technical Approach

Chrome에 설치된 MetaMask Flask 확장 프로그램을 Playwright에서 로드:
- Extension ID: `ljfoeinjpaedjfecbmggjgodbgkmjkjk`
- `chromium.launchPersistentContext`로 확장 프로그램 로드
- `chrome-extension://{id}/home.html`로 Snap 홈페이지 직접 접근

## Test Data

- Channel ID: `0xfaa339e2738b99d1f72c24f176885b2c4077e3b8165ee4e6b696c6d835ec6760`
- Server URL: `http://localhost:3000`
- Deposit Amount: `0.001` (테스트용 소액)

---

## Implementation Tasks

### Phase 1: Test Infrastructure Setup

- [ ] **Task 1.1**: Update snap.test.ts to load MetaMask Flask extension
  - Use `chromium.launchPersistentContext` with extension args
  - Load extension from Chrome profile path
  - Verify MetaMask is accessible

- [ ] **Task 1.2**: Create helper functions for MetaMask interaction
  - `getMetaMaskPage()` - Get MetaMask extension page
  - `navigateToSnap()` - Navigate to Snap homepage
  - `waitForMetaMaskPopup()` - Wait for and capture popup windows

### Phase 2: Core Workflow Tests

- [ ] **Task 2.1**: Test - Connect & Install Snap
  - Navigate to localhost:8000
  - Click "Connect" button
  - Handle MetaMask popup for connection approval
  - Handle Snap installation approval
  - Verify snap is installed

- [ ] **Task 2.2**: Test - Set Channel ID
  - Open Snap homepage in MetaMask
  - Click "Set Channel ID" button
  - Enter test channel ID in form
  - Click "Save" button
  - Verify channel ID is displayed in menu

- [ ] **Task 2.3**: Test - Set Server URL
  - Click "Set Server URL" button
  - Enter test server URL
  - Click "Save" button
  - Verify server URL is displayed in menu

- [ ] **Task 2.4**: Test - View Dashboard
  - Click "Dashboard" button
  - Verify channel state is displayed
  - Verify participant count is displayed
  - Verify token info is displayed
  - Verify leader address is displayed

### Phase 3: Transaction Tests

- [ ] **Task 3.1**: Test - Deposit Flow (Signature)
  - Click "Deposit" button
  - Enter deposit amount
  - Click "Deposit" button in form
  - Handle personal_sign popup (MPT Key generation)
  - Verify signature request appears

- [ ] **Task 3.2**: Test - Deposit Flow (Transaction)
  - After signature, handle eth_sendTransaction popup
  - Verify transaction details are correct
  - (Optional) Approve or reject transaction
  - Verify success/error message

- [ ] **Task 3.3**: Test - Activity View
  - Click "Activity" button
  - Verify activity page loads
  - Verify channel info is displayed

### Phase 4: Edge Cases & Error Handling

- [ ] **Task 4.1**: Test - Invalid Channel ID
  - Enter invalid channel ID (wrong length)
  - Verify error message is displayed

- [ ] **Task 4.2**: Test - No Channel Configured
  - Clear channel ID
  - Try to access Dashboard
  - Verify appropriate error/warning

---

## File Changes

| File | Change |
|------|--------|
| `snap/e2e/tests/snap.test.ts` | Full E2E test suite |
| `snap/e2e/tests/helpers/metamask.ts` | MetaMask interaction helpers |
| `snap/e2e/playwright.config.ts` | Update config for extension testing |

## Success Criteria

- [ ] All tests pass with headed browser (visible)
- [ ] Screenshots captured at each step
- [ ] MetaMask popups are handled correctly
- [ ] Snap UI navigation works as expected
- [ ] Error cases are properly tested
