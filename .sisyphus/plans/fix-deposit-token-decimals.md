# Fix Dynamic Token Display Across State Explorer

## TL;DR

> **Quick Summary**: `state-explorer` 전체에서 TON 토큰과 18 decimals가 하드코딩되어 USDT 등 다른 토큰 채널에서 잘못된 정보가 표시되는 문제 수정
> 
> **Deliverables**:
> - `layout.tsx`에서 토큰 정보를 Context로 공유
> - 모든 하드코딩된 TON/18 decimals를 동적 값으로 교체
> - 로딩 중 스피너 표시 (fallback 토큰 대신)
> 
> **Estimated Effort**: Medium (8개 파일 수정, Context 추가)
> **Parallel Execution**: Partial - Context 생성 후 병렬 수정 가능
> **Critical Path**: Task 1 (Context) → Tasks 2-9 (병렬 가능)

---

## Context

### Original Request
USDT를 targetContract로 지정하여 채널을 만들고 deposit 페이지로 이동했는데, 여전히 TON 기준으로 인풋과 디파짓 양을 보여주는 문제

### Interview Summary
**Key Discussions**:
- 채널 생성 시 USDT 선택 → 여러 페이지에서 TON으로 표시
- "Your Deposit: 0.000000000001 TON" 처럼 잘못된 심볼과 decimals 사용

**Research Findings - 하드코딩된 위치들**:

| 파일 | 문제 | 라인 |
|------|------|------|
| `deposit/_hooks/useApprove.ts` | `parseUnits(..., 18)` | 36 |
| `deposit/page.tsx` | fallback to TON, 로딩 스피너 없음 | 35-36 |
| `_components/ChannelStepper.tsx` | `formatUnits(..., 18)` + `"TON"` | 120, 211 |
| `withdraw/page.tsx` | `formatUnits(..., 18)` + `"TON"` | 40, 44, 63 |
| `state3/page.tsx` | `formatUnits(..., 18)` + `"TON"` | 279, 1063 |
| `layout.tsx` | `tokenSymbol="TON"`, `tokenDecimals={18}` | 267-268 |
| `transaction/page.tsx` | `tokenSymbol="TON"` (2곳) | 464, 537 |
| `_components/ParticipantDeposits.tsx` | default `tokenSymbol="TON"` | 39 |
| `_components/WithdrawSection.tsx` | `tokenSymbol = "TON"` | 27 |
| `_components/InitializeStateConfirmModal.tsx` | `tokenSymbol="TON"` | 174 |

**Key Insight**:
- `layout.tsx`에서 이미 `targetContract`를 가져오고 있음
- 이를 Context로 공유하면 하위 컴포넌트들이 동적 토큰 정보 사용 가능

---

## Work Objectives

### Core Objective
`state-explorer` 전체에서 채널의 실제 토큰(targetContract)에 맞는 심볼과 decimals를 동적으로 표시

### Concrete Deliverables
1. `TokenContext` 생성하여 토큰 정보 공유
2. 모든 하드코딩된 TON/18 decimals를 Context 값으로 교체
3. 로딩 중 스피너 표시

### Definition of Done
- [x] TypeScript 컴파일 성공 (`npm run type-check`)
- [x] Lint 통과 (`npm run lint`)
- [x] USDT 채널에서 모든 금액이 6 decimals로 표시
- [x] USDT 채널에서 "USDT" 심볼 표시 (TON 아님)
- [x] 토큰 정보 로딩 중 스피너 표시

### Must Have
- React Context로 토큰 정보 공유
- `getTokenByAddress()` 활용하여 동적 토큰 정보 조회
- 로딩 상태 처리

### Must NOT Have (Guardrails)
- ❌ `useChannelInfo` 훅 수정 금지
- ❌ 스마트 컨트랙트 ABI 변경 금지
- ❌ 새로운 외부 라이브러리 추가 금지
- ❌ 토큰 아이콘 동적 로딩 추가 (scope 외 - 향후 개선)
- ❌ 지원하지 않는 토큰 처리 추가 (기존 TON fallback 유지)

---

## Verification Strategy

### Automated Verification (Agent-Executable)
```bash
# 1. No hardcoded "18" in formatUnits/parseUnits calls in state-explorer
grep -rn "formatUnits.*18\)" app/state-explorer/
grep -rn "parseUnits.*18\)" app/state-explorer/
# Assert: No output (or only in comments)

# 2. No hardcoded tokenSymbol="TON" (except imports)
grep -rn 'tokenSymbol="TON"' app/state-explorer/ | grep -v "import"
grep -rn "tokenSymbol = \"TON\"" app/state-explorer/
# Assert: No output

# 3. Context exists
test -f app/state-explorer/_context/TokenContext.tsx
# Assert: File exists

# 4. Build passes
npm run type-check
# Assert: Exit 0

# 5. Lint passes
npm run lint
# Assert: Exit 0
```

---

## Execution Strategy

### Dependency Flow
```
Task 1: Create TokenContext
   │
   ├──► Task 2: Update layout.tsx (Provider 추가)
   │       │
   │       ├──► Task 3: Update ChannelStepper.tsx
   │       ├──► Task 4: Update deposit/page.tsx + useApprove.ts
   │       ├──► Task 5: Update withdraw/page.tsx
   │       ├──► Task 6: Update state3/page.tsx
   │       ├──► Task 7: Update transaction/page.tsx
   │       └──► Task 8: Update other components
   │
   └──► Verification
```

### Dependency Matrix

| Task | Depends On | Blocks | Parallel Group |
|------|------------|--------|----------------|
| 1 | None | 2 | A |
| 2 | 1 | 3,4,5,6,7,8 | B |
| 3 | 2 | None | C |
| 4 | 2 | None | C |
| 5 | 2 | None | C |
| 6 | 2 | None | C |
| 7 | 2 | None | C |
| 8 | 2 | None | C |

---

## TODOs

- [x] 1. Create TokenContext for sharing token info

  **What to do**:
  - `app/state-explorer/_context/TokenContext.tsx` 생성
  - Context: `{ tokenSymbol, tokenDecimals, tokenAddress, isLoading }`
  - Provider 컴포넌트 + useToken() hook export
  - `getTokenByAddress()` 활용하여 토큰 정보 조회

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**:
  - `packages/config/src/constants.ts:76-81` - `getTokenByAddress()` 함수
  - `packages/config/src/constants.ts:43-65` - `SUPPORTED_TOKENS` 정의 (decimals 포함)

  **Acceptance Criteria**:
  ```bash
  test -f app/state-explorer/_context/TokenContext.tsx
  grep -n "useToken" app/state-explorer/_context/TokenContext.tsx
  grep -n "getTokenByAddress" app/state-explorer/_context/TokenContext.tsx
  ```

  **Commit**: NO (group with Task 2)

---

- [x] 2. Update layout.tsx to provide TokenContext

  **What to do**:
  - TokenContext import
  - 기존 `targetContract`를 활용하여 토큰 정보 조회
  - TokenProvider로 children 감싸기
  - `ParticipantDeposits` 컴포넌트에 전달하는 props 수정

  **References**:
  - `app/state-explorer/layout.tsx:96-100` - 기존 targetContract 가져오는 로직
  - `app/state-explorer/layout.tsx:265-272` - ParticipantDeposits 사용부

  **Acceptance Criteria**:
  ```bash
  grep -n "TokenProvider" app/state-explorer/layout.tsx
  grep -n "useToken\|tokenSymbol.*TON" app/state-explorer/layout.tsx
  # Assert: TokenProvider 있고, tokenSymbol="TON" 없음
  ```

  **Commit**: YES
  - Message: `feat(state-explorer): add TokenContext for dynamic token info`
  - Files: TokenContext.tsx, layout.tsx

---

- [x] 3. Update ChannelStepper.tsx for dynamic token

  **What to do**:
  - `useToken()` hook 사용
  - `formatUnits(depositAmount, 18)` → `formatUnits(depositAmount, tokenDecimals)`
  - `"TON"` → `tokenSymbol`
  - 로딩 중이면 deposit 금액 숨기기 또는 스피너

  **References**:
  - `app/state-explorer/_components/ChannelStepper.tsx:118-121` - formatUnits 부분
  - `app/state-explorer/_components/ChannelStepper.tsx:211` - TON 하드코딩

  **Acceptance Criteria**:
  ```bash
  grep -n "useToken" app/state-explorer/_components/ChannelStepper.tsx
  grep -n "formatUnits.*18" app/state-explorer/_components/ChannelStepper.tsx
  # Assert: useToken 있고, formatUnits(..., 18) 없음
  ```

  **Commit**: NO (batch)

---

- [x] 4. Update deposit/page.tsx + useApprove.ts

  **What to do**:

  **useApprove.ts**:
  - `tokenDecimals: number` 파라미터 추가
  - `parseUnits(depositAmount, 18)` → `parseUnits(depositAmount, tokenDecimals)`

  **page.tsx**:
  - `useToken()` hook 사용 (Context에서 가져오기)
  - 로딩 중 스피너 표시
  - `useApprove`에 `tokenDecimals` 전달

  **References**:
  - `app/state-explorer/deposit/_hooks/useApprove.ts:18-21` - 인터페이스
  - `app/state-explorer/deposit/_hooks/useApprove.ts:36` - parseUnits
  - `app/state-explorer/deposit/page.tsx:28-40` - 토큰 정보 가져오는 부분
  - `app/state-explorer/deposit/page.tsx:69-72` - useApprove 호출

  **Acceptance Criteria**:
  ```bash
  grep -n "tokenDecimals" app/state-explorer/deposit/_hooks/useApprove.ts
  grep -n "parseUnits.*18" app/state-explorer/deposit/_hooks/useApprove.ts
  grep -n "useToken" app/state-explorer/deposit/page.tsx
  # Assert: tokenDecimals 있고, parseUnits(..., 18) 없고, useToken 있음
  ```

  **Commit**: NO (batch)

---

- [x] 5. Update withdraw/page.tsx for dynamic token

  **What to do**:
  - `useToken()` hook 사용
  - `formatUnits(withdrawableAmount, 18)` → `formatUnits(withdrawableAmount, tokenDecimals)`
  - `tokenSymbol="TON"` → `tokenSymbol={tokenSymbol}`
  - `symbol: "TON"` → `symbol: tokenSymbol`
  - 토큰 아이콘은 현재 TON만 있으므로 일단 유지 (TODO 주석 추가)

  **References**:
  - `app/state-explorer/withdraw/page.tsx:40` - formatUnits
  - `app/state-explorer/withdraw/page.tsx:44` - symbol: "TON"
  - `app/state-explorer/withdraw/page.tsx:63` - tokenSymbol="TON"

  **Acceptance Criteria**:
  ```bash
  grep -n "useToken" app/state-explorer/withdraw/page.tsx
  grep -n "formatUnits.*18" app/state-explorer/withdraw/page.tsx
  grep -n 'tokenSymbol="TON"' app/state-explorer/withdraw/page.tsx
  # Assert: useToken 있고, formatUnits(..., 18) 없고, tokenSymbol="TON" 없음
  ```

  **Commit**: NO (batch)

---

- [x] 6. Update state3/page.tsx for dynamic token

  **What to do**:
  - `useToken()` hook 사용
  - `formatUnits(userBalanceFromSnapshot, 18)` → `formatUnits(userBalanceFromSnapshot, tokenDecimals)`
  - `symbol: "TON"` → `symbol: tokenSymbol`

  **References**:
  - `app/state-explorer/state3/page.tsx:279` - formatUnits
  - `app/state-explorer/state3/page.tsx:1063` - symbol: "TON"

  **Acceptance Criteria**:
  ```bash
  grep -n "useToken" app/state-explorer/state3/page.tsx
  grep -n "formatUnits.*18" app/state-explorer/state3/page.tsx
  grep -n 'symbol: "TON"' app/state-explorer/state3/page.tsx
  # Assert: useToken 있고, formatUnits(..., 18) 없고, symbol: "TON" 없음
  ```

  **Commit**: NO (batch)

---

- [x] 7. Update transaction/page.tsx for dynamic token

  **What to do**:
  - `useToken()` hook 사용
  - `tokenSymbol="TON"` (2곳) → `tokenSymbol={tokenSymbol}`

  **References**:
  - `app/state-explorer/transaction/page.tsx:464` - tokenSymbol="TON"
  - `app/state-explorer/transaction/page.tsx:537` - tokenSymbol="TON"

  **Acceptance Criteria**:
  ```bash
  grep -n "useToken" app/state-explorer/transaction/page.tsx
  grep -n 'tokenSymbol="TON"' app/state-explorer/transaction/page.tsx
  # Assert: useToken 있고, tokenSymbol="TON" 없음
  ```

  **Commit**: NO (batch)

---

- [x] 8. Update remaining components

  **What to do**:
  - `ParticipantDeposits.tsx`: props 유지 but default 값 제거, 호출부에서 동적 값 전달
  - `WithdrawSection.tsx`: `useToken()` 사용
  - `InitializeStateConfirmModal.tsx`: props로 받거나 Context 사용

  **References**:
  - `app/state-explorer/_components/ParticipantDeposits.tsx:39` - default "TON"
  - `app/state-explorer/_components/WithdrawSection.tsx:27` - tokenSymbol = "TON"
  - `app/state-explorer/_components/InitializeStateConfirmModal.tsx:174` - tokenSymbol="TON"

  **Acceptance Criteria**:
  ```bash
  grep -rn 'tokenSymbol = "TON"' app/state-explorer/_components/
  grep -rn 'tokenSymbol="TON"' app/state-explorer/_components/
  # Assert: No output (or only in DepositConfirmModal which has default as fallback)
  ```

  **Commit**: YES
  - Message: `fix(state-explorer): use dynamic token info across all pages`
  - Files: All modified files

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 2 | `feat(state-explorer): add TokenContext for dynamic token info` | TokenContext.tsx, layout.tsx |
| 8 | `fix(state-explorer): use dynamic token info across all pages` | All other modified files |

---

## Success Criteria

### Verification Commands
```bash
# 1. No hardcoded 18 decimals in formatUnits/parseUnits
grep -rn "formatUnits.*18\)" app/state-explorer/ | grep -v "\.md"
grep -rn "parseUnits.*18\)" app/state-explorer/ | grep -v "\.md"
# Expected: No output

# 2. No hardcoded TON symbol (except imports and comments)
grep -rn 'tokenSymbol="TON"' app/state-explorer/ | grep -v "import\|//"
grep -rn 'symbol: "TON"' app/state-explorer/ | grep -v "import\|//"
# Expected: No output (or only default props in modals)

# 3. TokenContext exists and is used
grep -rn "useToken" app/state-explorer/ | wc -l
# Expected: 7+ (one per major component)

# 4. Build passes
npm run type-check
npm run lint
# Expected: Both exit 0
```

### Final Checklist
- [x] TokenContext 생성됨
- [x] layout.tsx에서 TokenProvider 사용
- [x] 모든 페이지에서 `useToken()` 사용
- [x] `formatUnits(..., 18)` 모두 동적 decimals로 변경
- [x] `tokenSymbol="TON"` 모두 동적 값으로 변경
- [x] 로딩 중 스피너 표시 (deposit page)
- [x] TypeScript/ESLint 통과
