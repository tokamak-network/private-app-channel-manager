/**
 * Formatting Utilities
 */

import { parseUnits } from "viem";

/**
 * Format Ethereum address
 */
export function formatAddress(address?: `0x${string}` | string | null): string {
  if (!address) return 'Not connected';
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format balance
 */
export function formatBalance(value: bigint, decimals: number = 18, precision: number = 4): string {
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  
  if (remainder === BigInt(0)) {
    return whole.toString();
  }
  
  const fractional = Number(remainder) / Number(divisor);
  const fractionalStr = fractional.toFixed(precision).replace(/\.?0+$/, '');
  
  return `${whole}.${fractionalStr.slice(2)}`;
}

/**
 * Format transaction hash
 */
export function formatTxHash(hash: string): string {
  if (hash.length < 10) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

/**
 * Validate amount input
 */
export function isValidAmount(amount: string): boolean {
  if (!amount || amount === "" || amount === "0") return false;
  try {
    const num = parseFloat(amount);
    return num > 0 && isFinite(num) && !isNaN(num);
  } catch {
    return false;
  }
}

/**
 * Parse input amount to BigInt (assuming 18 decimals)
 */
export function parseInputAmount(amount: string, decimals: number = 18): bigint {
  try {
    if (!amount || amount === "") return BigInt(0);
    return parseUnits(amount, decimals);
  } catch {
    return BigInt(0);
  }
}

/**
 * Format number string with thousand separators (commas)
 * e.g., "1234567.89" -> "1,234,567.89"
 */
export function formatWithCommas(value: string): string {
  const parts = value.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}
