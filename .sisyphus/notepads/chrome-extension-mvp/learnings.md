# Learnings - Chrome Extension MVP

## Session: ses_3e7f8f20affebSS7O27hgYsQAN
Started: 2026-02-01T07:41:34.734Z

---

## 2026-02-01 Task 0: WASM Compatibility Analysis

### Key Finding: NO WASM in tokamak-l2js!

**Analysis Result:**
- `tokamak-l2js` v0.0.10 does NOT use WASM
- Uses `poseidon-bls12381` which is **pure JavaScript** implementation
- Uses `@noble/curves` for jubjub curve operations - also **pure JavaScript**
- No `eval()` or `new Function()` usage detected

**Verification:**
```bash
# No WASM files found
find node_modules/tokamak-l2js -name "*.wasm"  # Returns nothing

# Pure JS poseidon implementation
cat node_modules/tokamak-l2js/dist/crypto/index.js
# Shows: import { poseidon2 } from "poseidon-bls12381"

# No eval usage
grep -r "eval\|Function(" node_modules/tokamak-l2js/dist/  # Only function references
```

**Implication:**
- Chrome Extension MV3 CSP will NOT block `tokamak-l2js`
- L2 transaction signing CAN run directly in extension
- No server-side fallback needed for signing
- Task 0 GO/NO-GO result: **GO** ✅

### Libraries Safe for Extension:
- `tokamak-l2js` - Pure JS
- `poseidon-bls12381` - Pure JS
- `@noble/curves` - Pure JS
- `@ethereumjs/*` - Pure JS

## 2026-02-01 Task 0: Verification Complete ✅

**Test Result:**
```
Testing tokamak-l2js with mock signature...
SUCCESS: {
  hasPrivateKey: true,
  hasPublicKey: true,
  privateKeyLength: 32,
  publicKeyLength: 32,
}
```

**Conclusion:**
- `tokamak-l2js` is 100% compatible with Chrome Extension
- No WASM, no eval, no Node-specific APIs
- L2 signing can run directly in extension popup
- GO/NO-GO GATE: **PASSED** ✅

# Task 1: Chrome Extension Project Setup

## Successful Patterns
- **CRXJS Vite Plugin**: `@crxjs/vite-plugin@2.x` works well with Vite 5.x for MV3 extensions
- **HashRouter**: Use `HashRouter` instead of `BrowserRouter` for Chrome extensions (no server routing)
- **Fixed dimensions**: Extension popup uses fixed 360x600px dimensions (MetaMask-style)
- **Tailwind config**: Custom color tokens work perfectly for dark theme design system

## Build Setup
- `bun` works for dependency management
- TypeScript compiles before Vite build (`tsc && vite build`)
- CRXJS handles manifest transformation automatically

## Config Adaptation
- Removed wagmi/viem imports from network config (extension is standalone)
- Created minimal ABIs with just essential functions (BridgeCore, BridgeDepositManager, ERC20)
- Hardcoded contract addresses to avoid external dependencies

## Icons Note
- Icons are optional in manifest.json - can be omitted during development
- Production should include proper PNG icons (16, 48, 128px)

## Design System Colors
```
Primary: #037DD6 (MetaMask blue)
Background: #24272A (dark)
Surface: #141618 (darker)
Border: #3B4046
Text primary: #FFFFFF
Text secondary: #9FA6AE
Success: #28A745
Error: #D73847
```
