# Learnings: fix-deposit-token-decimals

## 2026-02-02 Session

### Pattern: React Context for Cross-Component Token Info
- Created `TokenContext` in `app/state-explorer/_context/`
- Provider wraps children in layout.tsx, making token info available to all pages
- `useToken()` hook provides `{ tokenSymbol, tokenDecimals, tokenAddress, isLoading }`
- Leveraged existing `targetContract` variable already fetched in layout.tsx

### Key Files Modified
1. `TokenContext.tsx` - New context with provider and hook
2. `layout.tsx` - Added TokenProvider wrapper
3. `ChannelStepper.tsx` - Dynamic token display in deposit info
4. `deposit/page.tsx` - Loading spinner + context usage
5. `deposit/_hooks/useApprove.ts` - Added tokenDecimals parameter
6. `withdraw/page.tsx` - Dynamic token display
7. `state3/page.tsx` - Dynamic token display
8. `transaction/page.tsx` - Dynamic token display
9. `WithdrawSection.tsx` - Dynamic token symbol
10. `InitializeStateConfirmModal.tsx` - Dynamic token for ParticipantDeposits

### Gotchas Encountered
1. **useToken() must be called inside TokenProvider** - Components outside the provider will throw error
2. **tokenDecimals needed in useApprove** - parseUnits requires correct decimals for approval amount
3. **Default props kept in modals** - DepositConfirmModal, WithdrawConfirmModal, ParticipantDeposits keep default "TON" as fallback

### Token Config Reference
- `packages/config/src/constants.ts` contains SUPPORTED_TOKENS
- `getTokenByAddress(address)` returns token info by contract address
- TON: 18 decimals, USDT: 6 decimals, USDC: 6 decimals

### Verification Commands Used
```bash
# Check for hardcoded decimals
grep -rn "formatUnits.*18\|parseUnits.*18" app/state-explorer/ --include="*.tsx"

# Check for hardcoded TON symbol
grep -rn 'tokenSymbol="TON"' app/state-explorer/

# Count useToken usage
grep -rn "useToken" app/state-explorer/ --include="*.tsx" | wc -l
```
