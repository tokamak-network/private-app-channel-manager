/**
 * Step 1: Create Channel E2E Test with MetaMask (CDP Connection)
 *
 * Creates a new channel and saves the channelId to shared state
 * for subsequent lifecycle tests.
 */

import { test, expect, BrowserContext, Page, Browser } from '@playwright/test';
import {
  APP_URL,
  TEST_PARTICIPANTS,
  connectToCDP,
  unlockMetaMask,
  handleMetaMaskPopup,
  connectWallet,
  screenshot,
} from './helpers';
import { saveState } from './shared-state';

test.describe.serial('Create Channel with MetaMask', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    const cdp = await connectToCDP();
    browser = cdp.browser;
    context = cdp.context;
    page = cdp.page;

    // Unlock MetaMask first
    await unlockMetaMask(page);
  });

  test.afterAll(async () => {
    if (page) await page.close();
  });

  test('1. 지갑 연결', async () => {
    await page.goto(APP_URL);
    await page.waitForTimeout(3000);
    await screenshot(page, '01-app');

    await connectWallet(page, context);

    await screenshot(page, '01-connected');

    // Verify connection
    const headerText = await page.locator('[data-testid="account-header-button"]').textContent();
    console.log('계정 헤더 텍스트:', headerText);
    expect(headerText).toMatch(/0x|Sepolia/i);

    // Save leader address from header
    const addressMatch = headerText?.match(/0x[a-fA-F0-9]+/);
    if (addressMatch) {
      saveState({ leaderAddress: addressMatch[0] });
    }
  });

  test('2. Create Channel 페이지 이동', async () => {
    await page.goto(`${APP_URL}/create-channel`);
    await page.waitForTimeout(2000);
    await screenshot(page, '02-create-page');

    await expect(page.locator('h1').filter({ hasText: /Create Channel/i })).toBeVisible();
    console.log('Create Channel 페이지 로드 완료');
  });

  test('3. ERC20 앱 선택', async () => {
    const dropdown = page.locator('button').filter({ hasText: /Select App/i }).first();
    if (await dropdown.isVisible({ timeout: 3000 })) {
      await dropdown.click();
      await page.waitForTimeout(500);
      await page.locator('button').filter({ hasText: /^ERC20$/i }).first().click();
      console.log('ERC20 선택');
    }
    await screenshot(page, '03-erc20');
  });

  test('4. Channel ID 생성', async () => {
    const generateBtn = page.locator('[data-testid="generate-channel-id-button"]');
    if (await generateBtn.isVisible({ timeout: 5000 })) {
      await generateBtn.click();
      console.log('Channel ID 생성 클릭');
      await page.waitForTimeout(1500);
    }
    await screenshot(page, '04-channel-id');
  });

  test('5. 참가자 추가', async () => {
    // First participant
    const input0 = page.locator('[data-testid="participant-address-input-0"]');
    if (await input0.isVisible({ timeout: 5000 })) {
      await input0.fill(TEST_PARTICIPANTS[0]);
      console.log('참가자 1 입력:', TEST_PARTICIPANTS[0]);
      await page.waitForTimeout(1500);
    }

    // Second participant
    const input1 = page.locator('[data-testid="participant-address-input-1"]');
    if (await input1.isVisible({ timeout: 5000 })) {
      await input1.fill(TEST_PARTICIPANTS[1]);
      console.log('참가자 2 입력:', TEST_PARTICIPANTS[1]);
      await page.waitForTimeout(1000);
    }

    await screenshot(page, '05-participant');

    // Save participant addresses
    saveState({ participantAddresses: TEST_PARTICIPANTS });
  });

  test('6. 채널 생성', async () => {
    const createBtn = page.locator('[data-testid="create-channel-button"]');

    if (await createBtn.isVisible({ timeout: 5000 })) {
      const disabled = await createBtn.getAttribute('disabled');
      if (disabled === null) {
        await createBtn.click();
        console.log('Create Channel 클릭');
        await page.waitForTimeout(2000);

        // Modal confirm button
        const modalBtn = page.locator('button').filter({ hasText: /Confirm|Create|확인/i }).last();
        if (await modalBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await modalBtn.click();
          console.log('모달 확인');
          await page.waitForTimeout(2000);

          // MetaMask transaction approval
          await handleMetaMaskPopup(context, 'confirm');
          await page.waitForTimeout(15000);
        }
      } else {
        console.log('Create 버튼 비활성화 - Requirements 확인 필요');
        await screenshot(page, '06-disabled');
      }
    }

    await screenshot(page, '06-result');

    // Try to extract channel ID from the page and save to shared state
    const channelIdText = await page.locator('text=/0x[a-fA-F0-9]{8,}/').first().textContent().catch(() => null);
    if (channelIdText) {
      const channelIdMatch = channelIdText.match(/0x[a-fA-F0-9]+/);
      if (channelIdMatch) {
        saveState({
          channelId: channelIdMatch[0],
          createdAt: Date.now(),
        });
        console.log('Channel ID 저장:', channelIdMatch[0]);
      }
    }
  });
});
