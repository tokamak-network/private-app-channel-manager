---
description: Debug MetaMask Snap E2E test failures
---

# Debug Snap E2E

[SNAP E2E DEBUG MODE ACTIVATED]

## Objective

Diagnose and fix MetaMask Flask Snap E2E test failures using Playwright with Chrome CDP.

## Auto-Diagnosis Steps

1. **Check Prerequisites**
   ```bash
   lsof -i :8000 -i :8080 -i :9222 | grep LISTEN
   ```

2. **Review Last Test Run**
   - Check `snap/e2e/test-results/*.png` screenshots
   - Read `snap/e2e/test-results/.last-run.json`

3. **Run Tests**
   ```bash
   cd snap/e2e && npx playwright test 2>&1
   ```

4. **Analyze Failures**

## Common Issues (Auto-Check)

| Symptom | Cause | Fix |
|---------|-------|-----|
| "No popup appeared" | MetaMask uses notification.html | Navigate to notification.html directly |
| "Button not found" | getByRole fails | Use `locator().filter({hasText})` |
| Buttons disabled | Snap not installed | Check connect flow |
| LavaMoat error | page.evaluate blocked | Use page.textContent() |

## Invocation

This command uses `snap-e2e-debugger` agent with full project knowledge.

## Key Files

- `snap/e2e/tests/snap.test.ts` - Test file
- `snap/e2e/test-results/` - Screenshots
- `snap/e2e/AGENTS.md` - Knowledge base
- `snap/packages/snap/src/index.tsx` - Snap code

## Warning

**Chrome 사용 금지**: 테스트 실행 중 브라우저를 건드리면 상태 충돌 발생
