/**
 * Step 6: Close Channel E2E Test with MetaMask (CDP Connection)
 *
 * Tests closing the channel (leader only):
 * 1. Navigate to state3 page (Closing state)
 * 2. Click "Close Channel" button
 * 3. Confirm in modal
 * 4. Wait for Groth16 proof generation for final balances
 * 5. MetaMask transaction approval
 * 6. Verify redirect to withdraw page
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

test.describe.serial('Step 6: Close Channel', () => {
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

  test('1. State3 페이지 이동', async () => {
    await page.goto(APP_URL);
    await page.waitForTimeout(3000);

    await connectWallet(page, context);

    await navigateToChannel(page, channelId);
    await page.waitForTimeout(3000);

    await screenshot(page, '06-01-state3-page');

    // Should be on state3 page (Closing state)
    await expect(page).toHaveURL(/state3/, { timeout: 10_000 });
    console.log('State3 페이지 로드 완료');
  });

  test('2. Close Channel 버튼 클릭', async () => {
    const closeBtn = page.locator('[data-testid="close-channel-button"]');
    await expect(closeBtn).toBeVisible({ timeout: 10_000 });
    await expect(closeBtn).toBeEnabled({ timeout: 10_000 });

    await closeBtn.click();
    console.log('Close Channel 버튼 클릭');
    await page.waitForTimeout(2000);

    await screenshot(page, '06-02-close-modal');
  });

  test('3. 모달 확인 및 Proof 생성 대기', async () => {
    // Confirm in modal
    const confirmBtn = page.locator('button').filter({ hasText: /^Confirm$/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
      console.log('모달 Confirm 클릭');
    }

    // Wait for proof generation (Groth16 for final balances)
    console.log('Final balance proof 생성 대기 중 (최대 10분)...');

    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return (
          body.includes('Signing Transaction') ||
          body.includes('sign the transaction') ||
          body.includes('Confirming Transaction') ||
          body.includes('Channel closed') ||
          body.includes('closed successfully')
        );
      },
      { timeout: 10 * 60 * 1000 }
    );

    await screenshot(page, '06-03-proof-generated');
    console.log('Proof 생성 완료');
  });

  test('4. MetaMask 트랜잭션 승인', async () => {
    // Only handle MetaMask if we haven't reached completion yet
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (!bodyText.includes('Channel closed') && !bodyText.includes('closed successfully')) {
      await handleMetaMaskPopup(context, 'confirm');
      console.log('MetaMask 트랜잭션 승인');
      await page.waitForTimeout(5000);
    }

    await screenshot(page, '06-04-tx-confirming');
  });

  test('5. 채널 닫기 완료 및 Withdraw 리다이렉트', async () => {
    // Wait for close completion
    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return (
          body.includes('Channel closed') ||
          body.includes('closed successfully') ||
          body.includes('Withdraw') ||
          body.includes('Completed')
        );
      },
      { timeout: 60_000 }
    );

    await screenshot(page, '06-05-closed');
    console.log('채널 닫기 완료');

    // Close modal if present
    const closeModalBtn = page.locator('button').filter({ hasText: /^Close$/i }).first();
    if (await closeModalBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeModalBtn.click();
      await page.waitForTimeout(3000);
    }

    // Verify redirect to withdraw page (state 4 = Closed)
    await expect(page).toHaveURL(/withdraw/, { timeout: 15_000 });
    console.log('Withdraw 페이지로 리다이렉트 확인');

    await screenshot(page, '06-05-withdraw-page');

    saveState({ closedAt: Date.now() });
  });
});
