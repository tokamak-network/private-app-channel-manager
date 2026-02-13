/**
 * Step 4: L2 Transaction E2E Test with MetaMask (CDP Connection)
 *
 * Tests creating an L2 ERC20 transfer transaction:
 * 1. Navigate to transaction page (state 2 = Open)
 * 2. Enter recipient L2 address
 * 3. Enter transfer amount
 * 4. Click Create Transaction
 * 5. Confirm in modal, MetaMask sign
 * 6. Wait for synthesizer proof generation (up to 10 minutes)
 * 7. Verify proof appears in proof list
 */

import { test, expect, BrowserContext, Page, Browser } from '@playwright/test';
import {
  APP_URL,
  connectToCDP,
  unlockMetaMask,
  handleMetaMaskPopup,
  connectWallet,
  navigateToChannel,
  screenshot,
} from './helpers';
import { loadState, saveState } from './shared-state';

// Extended timeout for proof generation
test.setTimeout(15 * 60 * 1000);

test.describe.serial('Step 4: L2 Transaction', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let channelId: string;

  test.beforeAll(async () => {
    const state = loadState();
    if (!state.channelId) {
      throw new Error('No channelId in shared state. Run previous tests first.');
    }
    channelId = state.channelId;
    console.log('Channel ID:', channelId);

    const cdp = await connectToCDP();
    browser = cdp.browser;
    context = cdp.context;
    page = cdp.page;

    await unlockMetaMask(page);
  });

  test.afterAll(async () => {
    if (page) await page.close();
  });

  test('1. Transaction 페이지 이동', async () => {
    await page.goto(APP_URL);
    await page.waitForTimeout(3000);

    await connectWallet(page, context);

    await navigateToChannel(page, channelId);
    await page.waitForTimeout(3000);

    await screenshot(page, '04-01-transaction-page');

    // Should be on transaction page (state 2 = Open)
    await expect(page).toHaveURL(/transaction/, { timeout: 10_000 });
    console.log('Transaction 페이지 로드 완료');
  });

  test('2. 수신자 L2 주소 입력', async () => {
    const recipientInput = page.locator('[data-testid="recipient-address-input"]');
    await expect(recipientInput).toBeVisible({ timeout: 10_000 });

    // Use a participant's L2 address as recipient
    // In real test, this would be the participant's MPT key
    const state = loadState();
    const recipientAddress = state.participantAddresses[0] || '0x' + '1'.repeat(64);

    await recipientInput.fill(recipientAddress);
    await page.waitForTimeout(1000);

    await screenshot(page, '04-02-recipient-entered');
    console.log('수신자 주소 입력:', recipientAddress);
  });

  test('3. 전송 금액 입력', async () => {
    const amountInput = page.locator('[data-testid="transfer-amount-input"]');
    await expect(amountInput).toBeVisible({ timeout: 10_000 });

    await amountInput.fill('10');
    await page.waitForTimeout(1000);

    await screenshot(page, '04-03-amount-entered');
    console.log('전송 금액 입력: 10');
  });

  test('4. 트랜잭션 생성', async () => {
    const createTxBtn = page.locator('[data-testid="create-transaction-button"]');
    await expect(createTxBtn).toBeVisible({ timeout: 10_000 });
    await expect(createTxBtn).toBeEnabled({ timeout: 10_000 });

    await createTxBtn.click();
    console.log('Create Transaction 버튼 클릭');
    await page.waitForTimeout(2000);

    await screenshot(page, '04-04-create-tx-modal');

    // Confirm in modal if present
    const confirmBtn = page.locator('button').filter({ hasText: /^Confirm$/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
      console.log('모달 Confirm 클릭');
      await page.waitForTimeout(2000);
    }
  });

  test('5. MetaMask 서명', async () => {
    // MetaMask signature for L2 transaction
    await handleMetaMaskPopup(context, 'sign');
    console.log('MetaMask L2 트랜잭션 서명');
    await page.waitForTimeout(3000);

    await screenshot(page, '04-05-tx-signed');
  });

  test('6. Proof 생성 대기', async () => {
    // Wait for synthesizer proof generation
    // The UI should show progress indicators
    console.log('Proof 생성 대기 중 (최대 10분)...');

    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return (
          body.includes('Proof Generated') ||
          body.includes('proof#') ||
          body.includes('Completed') ||
          body.includes('completed')
        );
      },
      { timeout: 10 * 60 * 1000 }
    );

    await screenshot(page, '04-06-proof-generated');
    console.log('Proof 생성 완료');

    // Close modal if still open
    const closeBtn = page.locator('button').filter({ hasText: /^Close$/i }).first();
    if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('7. Proof 목록 확인', async () => {
    // Verify proof appears in the proof list
    await expect(page.locator('text=proof#')).toBeVisible({ timeout: 10_000 });
    await screenshot(page, '04-07-proof-in-list');
    console.log('Proof 목록에 표시 확인');

    saveState({ transactionAt: Date.now() });
  });
});
