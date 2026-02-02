# Snap E2E Testing Knowledge Base

## Overview
Playwright E2E tests for MetaMask Flask Snap using Chrome CDP connection.

## Critical Findings

### MetaMask Popup Handling
MetaMask Flask does NOT open popups as new browser windows/tabs. Instead:
- Notifications appear as **badge count (1)** on extension icon
- Must manually navigate to `notification.html` to interact

```typescript
async function openMetaMaskNotification(): Promise<Page> {
  const notificationUrl = `chrome-extension://${METAMASK_EXTENSION_ID}/notification.html`;
  const notificationPage = await context.newPage();
  await notificationPage.goto(notificationUrl);
  await notificationPage.waitForTimeout(1500);
  return notificationPage;
}
```

### Button Selection
`getByRole('button', { name: 'Connect' })` may fail even when button exists.
Use locator with text filter instead:

```typescript
// ❌ May not work
const connectBtn = page.getByRole('button', { name: 'Connect' });

// ✅ Works reliably
const connectBtn = page.locator('button').filter({ hasText: /^Connect$/ }).first();
```

### Chrome CDP Connection
Test requires Chrome running with debugging port:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

Connect via Playwright:
```typescript
browser = await chromium.connectOverCDP('http://localhost:9222');
```

**IMPORTANT**: User must NOT interact with Chrome during test execution - page navigation conflicts will break tests.

### MetaMask Extension ID
Flask extension ID: `ljfoeinjpaedjfecbmggjgodbgkmjkjk`

### Snap Servers
| Port | Service |
|------|---------|
| 8000 | Gatsby site (test frontend) |
| 8080 | Snap bundle server |
| 9222 | Chrome CDP |

## Test Flow Pattern

1. Click action button on site
2. Wait briefly for MetaMask to queue notification
3. Open `notification.html` in new page
4. Find and click approval buttons (Connect, Confirm, OK, etc.)
5. Close notification page
6. Verify site state changed

## Anti-Patterns

- ❌ `context.waitForEvent('page')` - MetaMask doesn't open new pages
- ❌ `page.evaluate()` in MetaMask pages - LavaMoat blocks eval
- ❌ Using Chrome while test runs - causes state conflicts
- ❌ `getByRole` for MetaMask buttons - use locator + filter instead
