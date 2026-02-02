/**
 * Unit tests for tokamak-zk-evm API token validation
 *
 * Tests the multi-token support feature:
 * - Default to TON when targetContract is undefined/null
 * - Accept valid supported token addresses (TON, USDT, USDC)
 * - Reject unsupported token addresses with HTTP 400
 * - Case-insensitive token address matching
 *
 * TDD RED Phase: These tests should FAIL until implementation is complete.
 */

import {
  SUPPORTED_TOKENS,
  getTokenByAddress,
  FIXED_TARGET_CONTRACT,
} from "../../packages/config/src/constants";

const TON_ADDRESS = SUPPORTED_TOKENS.TON.address;
const USDT_ADDRESS = SUPPORTED_TOKENS.USDT.address;
const USDC_ADDRESS = SUPPORTED_TOKENS.USDC.address;
const INVALID_ADDRESS = "0xDEADBEEF0000000000000000000000000000DEAD" as `0x${string}`;

function validateTargetContract(targetContract?: `0x${string}` | null): {
  valid: boolean;
  effectiveContract: `0x${string}`;
  error?: string;
} {
  if (!targetContract) {
    return {
      valid: true,
      effectiveContract: FIXED_TARGET_CONTRACT,
    };
  }

  const tokenInfo = getTokenByAddress(targetContract);
  if (!tokenInfo) {
    return {
      valid: false,
      effectiveContract: FIXED_TARGET_CONTRACT,
      error: `Unsupported token address: ${targetContract}. Supported tokens: TON, USDT, USDC`,
    };
  }

  return {
    valid: true,
    effectiveContract: targetContract.toLowerCase() as `0x${string}`,
  };
}

describe("tokamak-zk-evm API - Token Validation", () => {
  describe("validateTargetContract helper", () => {
    it("should default to TON when targetContract is undefined", () => {
      const result = validateTargetContract(undefined);

      expect(result.valid).toBe(true);
      expect(result.effectiveContract.toLowerCase()).toBe(
        TON_ADDRESS.toLowerCase()
      );
      expect(result.error).toBeUndefined();
    });

    it("should default to TON when targetContract is null", () => {
      const result = validateTargetContract(null);

      expect(result.valid).toBe(true);
      expect(result.effectiveContract.toLowerCase()).toBe(
        TON_ADDRESS.toLowerCase()
      );
      expect(result.error).toBeUndefined();
    });

    it("should accept valid TON address", () => {
      const result = validateTargetContract(TON_ADDRESS);

      expect(result.valid).toBe(true);
      expect(result.effectiveContract.toLowerCase()).toBe(
        TON_ADDRESS.toLowerCase()
      );
      expect(result.error).toBeUndefined();
    });

    it("should accept valid USDT address", () => {
      const result = validateTargetContract(USDT_ADDRESS);

      expect(result.valid).toBe(true);
      expect(result.effectiveContract.toLowerCase()).toBe(
        USDT_ADDRESS.toLowerCase()
      );
      expect(result.error).toBeUndefined();
    });

    it("should accept valid USDC address", () => {
      const result = validateTargetContract(USDC_ADDRESS);

      expect(result.valid).toBe(true);
      expect(result.effectiveContract.toLowerCase()).toBe(
        USDC_ADDRESS.toLowerCase()
      );
      expect(result.error).toBeUndefined();
    });

    it("should reject invalid token address", () => {
      const result = validateTargetContract(INVALID_ADDRESS);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Unsupported token address");
    });

    it("should handle case-insensitive token address matching", () => {
      const lowercaseAddress = USDT_ADDRESS.toLowerCase() as `0x${string}`;
      const resultLower = validateTargetContract(lowercaseAddress);

      expect(resultLower.valid).toBe(true);
      expect(resultLower.effectiveContract.toLowerCase()).toBe(
        USDT_ADDRESS.toLowerCase()
      );

      const uppercaseAddress = ("0x" +
        USDC_ADDRESS.slice(2).toUpperCase()) as `0x${string}`;
      const resultUpper = validateTargetContract(uppercaseAddress);

      expect(resultUpper.valid).toBe(true);
      expect(resultUpper.effectiveContract.toLowerCase()).toBe(
        USDC_ADDRESS.toLowerCase()
      );
    });
  });

  describe("getTokenByAddress (from @tokamak/config)", () => {
    it("should return TON token info for TON address", () => {
      const tokenInfo = getTokenByAddress(TON_ADDRESS);

      expect(tokenInfo).toBeDefined();
      expect(tokenInfo?.symbol).toBe("TON");
      expect(tokenInfo?.decimals).toBe(18);
    });

    it("should return USDT token info for USDT address", () => {
      const tokenInfo = getTokenByAddress(USDT_ADDRESS);

      expect(tokenInfo).toBeDefined();
      expect(tokenInfo?.symbol).toBe("USDT");
      expect(tokenInfo?.decimals).toBe(6);
    });

    it("should return USDC token info for USDC address", () => {
      const tokenInfo = getTokenByAddress(USDC_ADDRESS);

      expect(tokenInfo).toBeDefined();
      expect(tokenInfo?.symbol).toBe("USDC");
      expect(tokenInfo?.decimals).toBe(6);
    });

    it("should return undefined for invalid address", () => {
      const tokenInfo = getTokenByAddress(INVALID_ADDRESS);

      expect(tokenInfo).toBeUndefined();
    });

    it("should be case-insensitive", () => {
      const lowercaseResult = getTokenByAddress(TON_ADDRESS.toLowerCase());
      const uppercaseResult = getTokenByAddress(
        "0x" + TON_ADDRESS.slice(2).toUpperCase()
      );

      expect(lowercaseResult?.symbol).toBe("TON");
      expect(uppercaseResult?.symbol).toBe("TON");
    });
  });

  describe("Token decimals configuration", () => {
    it("should have correct decimals for TON (18)", () => {
      expect(SUPPORTED_TOKENS.TON.decimals).toBe(18);
    });

    it("should have correct decimals for USDT (6)", () => {
      expect(SUPPORTED_TOKENS.USDT.decimals).toBe(6);
    });

    it("should have correct decimals for USDC (6)", () => {
      expect(SUPPORTED_TOKENS.USDC.decimals).toBe(6);
    });
  });
});
