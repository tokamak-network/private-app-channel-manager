# Multi-Token Support for Tokamak-Zk-EVM API

## TL;DR

> **Quick Summary**: Add USDT/USDC token support to the synthesize API by accepting a dynamic `targetContract` parameter and fixing the hardcoded decimals bug.
> 
> **Deliverables**:
> - Updated `route.ts` with `targetContract` parameter
> - Updated `synthesize-stream/route.ts` with same changes
> - Fixed decimals bug in `useSynthesizer.ts`
> - Jest unit tests for token validation
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (Tests) → Task 2 (API) → Task 3 (Hook) → Task 4 (Integration)

---

## Context

### Original Request
Add multi-token (USDT/USDC) support to the tokamak-zk-evm API, which currently only supports TON.

### Interview Summary
**Key Discussions**:
- Current API uses `FIXED_TARGET_CONTRACT` (TON only)
- Need to accept `targetContract` parameter dynamically
- TDD approach selected for testing

**Research Findings**:
- `SUPPORTED_TOKENS` in `packages/config/src/constants.ts` defines TON, USDT, USDC
- `getTokenByAddress()` validates if a token is supported
- Token decimals: TON=18, USDT=6, USDC=6
- **CRITICAL BUG**: `useSynthesizer.ts` line 72 hardcodes 18 decimals

### Metis Review
**Identified Gaps** (addressed):
- Decimals hardcoding bug → Fix in Task 3
- Both API routes need updating → Task 2 covers both
- Backward compatibility → Default to TON when no targetContract
- Token validation → Use `getTokenByAddress()` with HTTP 400 for invalid

---

## Work Objectives

### Core Objective
Enable the synthesize API to process L2 transactions for any supported ERC20 token (TON, USDT, USDC) while maintaining backward compatibility.

### Concrete Deliverables
- `app/api/tokamak-zk-evm/route.ts` - Updated with `targetContract` parameter
- `app/api/tokamak-zk-evm/synthesize-stream/route.ts` - Same updates
- `app/state-explorer/_hooks/useSynthesizer.ts` - Add `targetContract` param, fix decimals
- `__tests__/api/tokamak-zk-evm.test.ts` - Unit tests for token validation

### Definition of Done
- [ ] All tests pass: `npm test`
- [ ] API accepts `targetContract` parameter
- [ ] API defaults to TON when `targetContract` omitted (backward compatible)
- [ ] API returns HTTP 400 for unsupported tokens
- [ ] Decimals correctly applied based on token (18 for TON, 6 for USDT/USDC)

### Must Have
- `targetContract` parameter in request type (optional for backward compat)
- Token validation using `getTokenByAddress()`
- Dynamic decimals in `useSynthesizer.ts`
- Tests covering token validation scenarios

### Must NOT Have (Guardrails)
- NO changes to `tokamak-cli` or Tokamak-Zk-EVM submodule
- NO changes to smart contract hooks
- NO UI changes (token selector, etc.)
- NO changes to proof storage structure
- NO automatic decimals detection in API (caller's responsibility)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (Jest)
- **User wants tests**: TDD
- **Framework**: Jest

### TDD Workflow

Each implementation task follows RED-GREEN-REFACTOR:

**Task Structure:**
1. **RED**: Write failing test first
   - Test file: `__tests__/api/tokamak-zk-evm.test.ts`
   - Test command: `npm test`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `npm test`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green
   - Command: `npm test`
   - Expected: PASS (still)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: Write unit tests for token validation (TDD RED phase)

Wave 2 (After Wave 1):
├── Task 2: Update API routes (both route.ts and synthesize-stream)
└── Task 3: Fix useSynthesizer hook

Wave 3 (After Wave 2):
└── Task 4: Integration verification
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3 | None |
| 2 | 1 | 4 | 3 |
| 3 | 1 | 4 | 2 |
| 4 | 2, 3 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1 | `delegate_task(category="quick", load_skills=[], ...)` |
| 2 | 2, 3 | dispatch parallel after Wave 1 completes |
| 3 | 4 | final verification task |

---

## TODOs

- [ ] 1. Write Unit Tests for Token Validation (TDD RED)

  **What to do**:
  - Create `__tests__/api/tokamak-zk-evm.test.ts`
  - Write tests for:
    - Default to TON when `targetContract` is undefined/null
    - Accept valid supported token addresses (TON, USDT, USDC)
    - Reject unsupported token addresses with HTTP 400
    - Case-insensitive token address matching
  - Tests should FAIL initially (RED phase)

  **Must NOT do**:
  - Do not modify API implementation yet
  - Do not add unnecessary test cases

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation, well-defined test cases
  - **Skills**: `[]`
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (alone)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None (can start immediately)

  **References**:
  - `packages/config/src/constants.ts:43-94` - SUPPORTED_TOKENS, getTokenByAddress()
  - `app/api/tokamak-zk-evm/route.ts:27-35` - Current SynthesizeTxRequest type
  - `test/hooks/usePreviousStateSnapshot.test.ts` - Example test patterns in this project

  **Acceptance Criteria**:
  
  **TDD (tests enabled):**
  - [ ] Test file created: `__tests__/api/tokamak-zk-evm.test.ts`
  - [ ] Test covers: default to TON when no targetContract
  - [ ] Test covers: accept valid USDT address
  - [ ] Test covers: accept valid USDC address
  - [ ] Test covers: reject invalid token address with HTTP 400
  - [ ] `npm test` → FAIL (tests exist, implementation doesn't)

  **Commit**: YES
  - Message: `test(api): add token validation tests for multi-token support`
  - Files: `__tests__/api/tokamak-zk-evm.test.ts`
  - Pre-commit: `npm run lint`

---

- [ ] 2. Update API Routes with targetContract Parameter

  **What to do**:
  - In `route.ts`:
    - Add `targetContract?: \`0x${string}\`` to `SynthesizeTxRequest` type
    - Import `getTokenByAddress` from `@tokamak/config`
    - Validate targetContract: if provided, must be supported token
    - Default to `FIXED_TARGET_CONTRACT` (TON) when omitted
    - Return HTTP 400 with clear error for unsupported tokens
    - Replace all `FIXED_TARGET_CONTRACT` usages with validated contract
  - In `synthesize-stream/route.ts`:
    - Apply identical changes for feature parity

  **Must NOT do**:
  - Do not change CLI interface
  - Do not add new features beyond token support
  - Do not modify proof storage

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Straightforward parameter addition and validation
  - **Skills**: `[]`
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:
  - `app/api/tokamak-zk-evm/route.ts:16-19` - Current imports from @tokamak/config
  - `app/api/tokamak-zk-evm/route.ts:27-35` - SynthesizeTxRequest type definition
  - `app/api/tokamak-zk-evm/route.ts:497-513` - FIXED_TARGET_CONTRACT usage for contract code
  - `app/api/tokamak-zk-evm/synthesize-stream/route.ts:171-186` - Same pattern to update
  - `packages/config/src/constants.ts:76-81` - getTokenByAddress() implementation

  **Acceptance Criteria**:
  
  **TDD (tests enabled):**
  - [ ] `npm test` → PASS (tests now passing)

  **Automated Verification (API):**
  ```bash
  # Test: Default to TON when no targetContract (using actual API)
  # This will be a curl test in integration phase
  ```

  **Commit**: YES
  - Message: `feat(api): add multi-token support with targetContract parameter`
  - Files: `app/api/tokamak-zk-evm/route.ts`, `app/api/tokamak-zk-evm/synthesize-stream/route.ts`
  - Pre-commit: `npm run lint && npm test`

---

- [ ] 3. Fix useSynthesizer Hook (Critical Bug + targetContract)

  **What to do**:
  - Add `targetContract` to `UseSynthesizerParams` interface
  - Import `getTokenByAddress` from `@tokamak/config`
  - Fix decimals bug (line 72): Use token-specific decimals
    ```typescript
    const tokenInfo = getTokenByAddress(targetContract ?? TON_TOKEN_ADDRESS);
    const decimals = tokenInfo?.decimals ?? 18;
    const amountInWei = parseInputAmount(tokenAmount!.trim(), decimals);
    ```
  - Pass `targetContract` to `createERC20TransferTx()`
  - Update `SynthesizeTxRequest` to include `targetContract`

  **Must NOT do**:
  - Do not change UI components
  - Do not change createERC20TransferTx implementation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, focused changes in single file
  - **Skills**: `[]`
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:
  - `app/state-explorer/_hooks/useSynthesizer.ts:12` - TON_TOKEN_ADDRESS import
  - `app/state-explorer/_hooks/useSynthesizer.ts:24-30` - UseSynthesizerParams interface
  - `app/state-explorer/_hooks/useSynthesizer.ts:72` - CRITICAL: Hardcoded 18 decimals bug
  - `app/state-explorer/_hooks/useSynthesizer.ts:74-80` - createERC20TransferTx call
  - `packages/config/src/constants.ts:43-65` - Token decimals (TON=18, USDT=6, USDC=6)
  - `lib/createERC20TransferTx.ts:35-41` - Already supports tokenAddress parameter

  **Acceptance Criteria**:
  
  **TDD (tests enabled):**
  - [ ] Tests pass for decimals handling

  **Code Review Verification:**
  - [ ] Decimals uses `getTokenByAddress(targetContract)?.decimals`
  - [ ] `targetContract` is passed to API request
  - [ ] Default to TON_TOKEN_ADDRESS when targetContract not provided

  **Commit**: YES
  - Message: `fix(hooks): use dynamic decimals for multi-token support`
  - Files: `app/state-explorer/_hooks/useSynthesizer.ts`
  - Pre-commit: `npm run lint && npm test`

---

- [ ] 4. Integration Verification

  **What to do**:
  - Run full test suite: `npm test`
  - Verify type checking: `npm run type-check`
  - Verify linting: `npm run lint`
  - Manual curl test (if dev server available):
    ```bash
    # Test unsupported token rejection
    curl -X POST http://localhost:3000/api/tokamak-zk-evm \
      -H "Content-Type: application/json" \
      -d '{"action":"synthesize","channelId":"test","targetContract":"0xDEADBEEF0000000000000000000000000000DEAD"}'
    # Expected: HTTP 400 with error message
    ```

  **Must NOT do**:
  - Do not modify code (read-only verification)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification only, no code changes
  - **Skills**: `[]`
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (alone)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 2, 3

  **References**:
  - `package.json` - Test and lint scripts

  **Acceptance Criteria**:
  
  **Automated Verification:**
  ```bash
  # Agent runs:
  npm test
  # Assert: All tests pass
  
  npm run type-check
  # Assert: No TypeScript errors
  
  npm run lint
  # Assert: No linting errors
  ```

  **Commit**: NO (verification only)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `test(api): add token validation tests for multi-token support` | `__tests__/api/tokamak-zk-evm.test.ts` | `npm run lint` |
| 2 | `feat(api): add multi-token support with targetContract parameter` | `route.ts`, `synthesize-stream/route.ts` | `npm test` |
| 3 | `fix(hooks): use dynamic decimals for multi-token support` | `useSynthesizer.ts` | `npm test` |

---

## Success Criteria

### Verification Commands
```bash
npm test              # All tests pass
npm run type-check    # No TypeScript errors
npm run lint          # No linting errors
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Backward compatibility maintained (no targetContract = TON)
- [ ] Decimals bug fixed (6 for USDT/USDC, 18 for TON)
