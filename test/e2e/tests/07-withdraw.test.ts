/**
 * Step 7: Withdraw E2E Test with MetaMask (CDP Connection)
 *
 * Tests token withdrawal after channel closure:
 * 1. Navigate to withdraw page (state 4 = Closed)
 * 2. Verify withdrawable amount is displayed
 * 3. Click withdraw button
 * 4. MetaMask transaction approval
 * 5. Verify withdrawal completion
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

test.setTimeout(180_000);

test.describe.serial('Step 7: Withdraw', () => {
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

  test('1. Withdraw 페이지 이동', async () => {
    await page.goto(APP_URL);
    await page.waitForTimeout(3000);

    await connectWallet(page, context);

    await navigateToChannel(page, channelId);
    await page.waitForTimeout(3000);

    await screenshot(page, '07-01-withdraw-page');

    // Should be on withdraw page (state 4 = Closed)
    await expect(page).toHaveURL(/withdraw/, { timeout: 10_000 });
    console.log('Withdraw 페이지 로드 완료');
  });

  test('2. 인출 가능 금액 확인', async () => {
    // Verify some amount information is displayed
    await expect(page.locator('text=Amount').or(page.locator('text=Withdraw'))).toBeVisible({ timeout: 10_000 });

    await screenshot(page, '07-02-amount-displayed');
    console.log('인출 가능 금액 표시 확인');
  });

  test('3. Withdraw 실행', async () => {
    const withdrawBtn = page.locator('[data-testid="withdraw-button"]');
    await expect(withdrawBtn).toBeVisible({ timeout: 10_000 });
    await expect(withdrawBtn).toBeEnabled({ timeout: 10_000 });

    await withdrawBtn.click();
    console.log('Withdraw 버튼 클릭');
    await page.waitForTimeout(2000);

    await screenshot(page, '07-03-withdraw-clicked');

    // Confirm in modal if present
    const confirmBtn = page.locator('button').filter({ hasText: /^Confirm$/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
      console.log('모달 Confirm 클릭');
      await page.waitForTimeout(2000);
    }
  });

  test('4. MetaMask 트랜잭션 승인', async () => {
    await handleMetaMaskPopup(context, 'confirm');
    console.log('MetaMask 트랜잭션 승인');
    await page.waitForTimeout(15_000);

    await screenshot(page, '07-04-tx-confirming');
  });

  test('5. 인출 완료 확인', async () => {
    // Wait for withdrawal confirmation
    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return (
          body.includes('Withdrawn') ||
          body.includes('Completed') ||
          body.includes('completed') ||
          body.includes('Success') ||
          body.includes('Withdrawal Complete')
        );
      },
      { timeout: 60_000 }
    );

    await screenshot(page, '07-05-withdrawn');

    saveState({ withdrawnAt: Date.now() });
    console.log('인출 완료 - 채널 라이프사이클 테스트 완료!');
  });
});
