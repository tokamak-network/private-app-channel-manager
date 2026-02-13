/**
 * Step 2: Deposit Tokens E2E Test with MetaMask (CDP Connection)
 *
 * Tests the leader deposit flow:
 * 1. Navigate to deposit page via channelId from shared state
 * 2. Enter deposit amount
 * 3. Approve token spending if needed (MetaMask confirm)
 * 4. Deposit with MetaMask signatures (MPT key + deposit tx)
 * 5. Verify deposit completion
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

// Deposit can take time for approval + deposit tx
test.setTimeout(180_000);

test.describe.serial('Step 2: Leader Deposit', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let channelId: string;

  test.beforeAll(async () => {
    // Load channel ID from previous step
    const state = loadState();
    if (!state.channelId) {
      throw new Error('No channelId in shared state. Run createChannel test first.');
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

  test('1. 지갑 연결 및 Deposit 페이지 이동', async () => {
    // Navigate to the app first to connect wallet
    await page.goto(APP_URL);
    await page.waitForTimeout(3000);

    await connectWallet(page, context);

    // Navigate to channel - should redirect to deposit page (state 1)
    await navigateToChannel(page, channelId);
    await page.waitForTimeout(3000);

    await screenshot(page, '02-01-deposit-page');

    // Verify we're on the deposit page
    await expect(page.locator('text=Deposit')).toBeVisible({ timeout: 10_000 });
    console.log('Deposit 페이지 로드 완료');
  });

  test('2. 입금 금액 입력', async () => {
    const amountInput = page.locator('[data-testid="deposit-amount-input"]');
    await expect(amountInput).toBeVisible({ timeout: 10_000 });

    // Enter deposit amount (e.g., 100 TON)
    await amountInput.fill('100');
    await page.waitForTimeout(1000);

    await screenshot(page, '02-02-amount-entered');
    console.log('입금 금액 입력: 100');
  });

  test('3. Token Approve (필요시)', async () => {
    // Check if approve button is visible (needed when allowance < deposit amount)
    const approveBtn = page.locator('[data-testid="approve-button"]');

    if (await approveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Approve 필요 - 클릭');
      await approveBtn.click();
      await page.waitForTimeout(2000);

      // MetaMask approve transaction
      await handleMetaMaskPopup(context, 'confirm');
      await page.waitForTimeout(10_000);

      await screenshot(page, '02-03-approved');
      console.log('Token Approve 완료');
    } else {
      console.log('Approve 불필요 (충분한 allowance)');
      await screenshot(page, '02-03-no-approve-needed');
    }
  });

  test('4. Deposit 실행', async () => {
    // Wait for deposit button to be visible and enabled
    const depositBtn = page.locator('[data-testid="deposit-button"]');
    await expect(depositBtn).toBeVisible({ timeout: 10_000 });
    await expect(depositBtn).toBeEnabled({ timeout: 10_000 });

    // Click deposit button
    await depositBtn.click();
    console.log('Deposit 버튼 클릭');
    await page.waitForTimeout(2000);

    await screenshot(page, '02-04-deposit-modal');

    // Confirm in modal
    const confirmBtn = page.locator('button').filter({ hasText: /^Confirm$/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
      console.log('모달 Confirm 클릭');
      await page.waitForTimeout(2000);
    }

    // MetaMask signature 1: MPT key generation (personal_sign)
    console.log('MetaMask 서명 1: MPT Key 생성');
    await handleMetaMaskPopup(context, 'sign');
    await page.waitForTimeout(3000);

    await screenshot(page, '02-04-mpt-key-signed');

    // MetaMask signature 2: Deposit transaction
    console.log('MetaMask 서명 2: Deposit 트랜잭션');
    await handleMetaMaskPopup(context, 'confirm');
    await page.waitForTimeout(15_000);

    await screenshot(page, '02-04-deposit-tx-sent');
  });

  test('5. Deposit 완료 확인', async () => {
    // Wait for completion indicator
    // The modal should show "Deposit Completed" or similar
    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return (
          body.includes('Completed') ||
          body.includes('completed') ||
          body.includes('Success') ||
          body.includes('Deposit Completed')
        );
      },
      { timeout: 60_000 }
    );

    await screenshot(page, '02-05-deposit-completed');

    // Save state
    saveState({ depositedAt: Date.now() });
    console.log('Deposit 완료');
  });
});
