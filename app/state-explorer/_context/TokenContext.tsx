/**
 * Token Context
 *
 * Provides token information (symbol, decimals) based on channel's targetContract
 * Used across state-explorer pages to display correct token info
 */

"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getTokenByAddress, SUPPORTED_TOKENS } from "@tokamak/config";

interface TokenContextValue {
  tokenSymbol: string;
  tokenDecimals: number;
  tokenAddress: string | null;
  isLoading: boolean;
}

const TokenContext = createContext<TokenContextValue | null>(null);

interface TokenProviderProps {
  targetContract: string | null;
  isLoading?: boolean;
  children: ReactNode;
}

export function TokenProvider({
  targetContract,
  isLoading = false,
  children,
}: TokenProviderProps) {
  const value = useMemo(() => {
    if (!targetContract) {
      return {
        tokenSymbol: SUPPORTED_TOKENS.TON.symbol,
        tokenDecimals: SUPPORTED_TOKENS.TON.decimals,
        tokenAddress: null,
        isLoading,
      };
    }

    const tokenInfo = getTokenByAddress(targetContract);
    return {
      tokenSymbol: tokenInfo?.symbol ?? SUPPORTED_TOKENS.TON.symbol,
      tokenDecimals: tokenInfo?.decimals ?? SUPPORTED_TOKENS.TON.decimals,
      tokenAddress: targetContract,
      isLoading,
    };
  }, [targetContract, isLoading]);

  return (
    <TokenContext.Provider value={value}>{children}</TokenContext.Provider>
  );
}

export function useToken(): TokenContextValue {
  const context = useContext(TokenContext);
  if (!context) {
    throw new Error("useToken must be used within a TokenProvider");
  }
  return context;
}
