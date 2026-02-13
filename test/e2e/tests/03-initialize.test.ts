/**
 * Step 3: Initialize Channel State E2E Test with MetaMask (CDP Connection)
 *
 * Tests the channel initialization flow (leader only):
 * 1. Navigate to deposit page (state 1)
 * 2. Click "Initialize State" button
 * 3. Confirm in modal
 * 4. Wait for Groth16 proof generation (up to 10 minutes)
 * 5. MetaMask transaction approval
 * 6. Verify state change (redirect to transaction page)
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

// Extended timeout for proof generation (15 minutes)
test.setTimeout(15 * 60 * 1000);

test.describe.serial('Step 3: Initialize Channel State', () => {
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

  test('1. 지갑 연결 및 Deposit 페이지 확인', async () => {
    await page.goto(APP_URL);
    await page.waitForTimeout(3000);

    await connectWallet(page, context);

    await navigateToChannel(page, channelId);
    await page.waitForTimeout(3000);

    await screenshot(page, '03-01-deposit-page');

    // Should be on deposit page (state 1 = Initialized)
    await expect(page.locator('text=Deposit')).toBeVisible({ timeout: 10_000 });
    console.log('Deposit 페이지 확인');
  });

  test('2. Initialize State 버튼 클릭', async () => {
    // Leader should see the Initialize State button
    const initBtn = page.locator('[data-testid="initialize-state-button"]');
    await expect(initBtn).toBeVisible({ timeout: 10_000 });
    await expect(initBtn).toBeEnabled({ timeout: 10_000 });

    await initBtn.click();
    console.log('Initialize State 버튼 클릭');
    await page.waitForTimeout(2000);

    await screenshot(page, '03-02-init-modal');
  });

  test('3. 모달 확인 및 Proof 생성 대기', async () => {
    // The modal should show "Confirm Initialize"
    await expect(page.locator('text=Confirm Initialize')).toBeVisible({ timeout: 5000 });

    // Click Confirm button in modal
    const confirmBtn = page.locator('button').filter({ hasText: /^Confirm$/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();
    console.log('모달 Confirm 클릭');

    // Wait for proof generation phase
    // The modal should show "Generating Proof" or "Initializing State"
    await expect(page.locator('text=Initializing State')).toBeVisible({ timeout: 10_000 });
    console.log('Proof 생성 시작...');

    await screenshot(page, '03-03-generating-proof');

    // Wait for proof generation to complete and signing step to appear
    // This can take up to 10 minutes for Groth16 proof generation
    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return (
          body.includes('Signing Transaction') ||
          body.includes('sign the transaction') ||
          body.includes('Confirming Transaction')
        );
      },
      { timeout: 10 * 60 * 1000 } // 10 minutes
    );
    console.log('Proof 생성 완료, 서명 단계 진입');

    await screenshot(page, '03-03-proof-generated');
  });

  test('4. MetaMask 트랜잭션 승인', async () => {
    // MetaMask transaction confirmation
    await handleMetaMaskPopup(context, 'confirm');
    console.log('MetaMask 트랜잭션 승인');
    await page.waitForTimeout(5000);

    await screenshot(page, '03-04-tx-confirming');
  });

  test('5. 초기화 완료 확인', async () => {
    // Wait for "State Initialized" success message
    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return body.includes('State Initialized');
      },
      { timeout: 60_000 }
    );

    await screenshot(page, '03-05-initialized');
    console.log('State 초기화 완료');

    // Close the modal
    const closeBtn = page.locator('button').filter({ hasText: /^Close$/i }).first();
    if (await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(3000);
    }

    // Verify redirect to transaction page (state 2 = Open)
    await expect(page).toHaveURL(/transaction/, { timeout: 10_000 });
    console.log('Transaction 페이지로 리다이렉트 확인');

    await screenshot(page, '03-05-transaction-page');

    saveState({ initializedAt: Date.now() });
  });
});
