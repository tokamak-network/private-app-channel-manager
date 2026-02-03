/**
 * Account Panel Component
 *
 * Displays wallet connection status and account information
 *
 * Design:
 * - https://www.figma.com/design/0R11fVZOkNSTJjhTKvUjc7/Ooo?node-id=3138-233297
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  useAccount,
  useConnect,
  useDisconnect,
} from "wagmi";
import { Copy, ChevronDown, LogOut, Loader2, AlertCircle, CheckCircle, Plus, Check } from "lucide-react";
import { formatAddress } from "@/lib/utils/format";
import { isValidBytes32 } from "@/lib/channelId";
import { useGenerateMptKey } from "@/hooks/useGenerateMptKey";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { useChannelParticipantCheck } from "@/hooks/useChannelParticipantCheck";
import { useChannelUserBalance } from "@/hooks/useChannelUserBalance";
import { useBalanceSlotIndex } from "@/hooks/useBalanceSlotIndex";
import { useConnectedAccounts } from "@/hooks/useConnectedAccounts";
import { getTokenByAddress } from "@tokamak/config";

import TONSymbol from "@/assets/symbols/TON.svg";
import USDTSymbol from "@/assets/symbols/USDT.svg";
import USDCSymbol from "@/assets/symbols/USDC.svg";

interface AccountPanelProps {
  onClose?: () => void;
}

export function AccountPanel({ onClose }: AccountPanelProps) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  // Multi-account support
  const {
    accounts,
    isLoading: isLoadingAccounts,
    requestMoreAccounts,
    isRequestingAccounts,
    refreshAccounts,
  } = useConnectedAccounts();

  // Account dropdown state
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);
  const [copiedDropdownAddress, setCopiedDropdownAddress] = useState<string | null>(null);

  // Handle copy address in dropdown
  const handleCopyDropdownAddress = async (address: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent dropdown from closing
    try {
      await navigator.clipboard.writeText(address);
      setCopiedDropdownAddress(address);
      setTimeout(() => setCopiedDropdownAddress(null), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  // Track previous address to detect account changes
  const prevAddressRef = useRef<string | undefined>(address);

  // L2 Address calculation state - Channel ID input
  const [channelIdInput, setChannelIdInput] = useState("");
  const [isChannelLoaded, setIsChannelLoaded] = useState(false); // Track if Load button was clicked
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedL2Address, setCopiedL2Address] = useState(false);

  // Transaction history filter state - Network selector
  const [txNetworkType, setTxNetworkType] = useState<"sepolia" | "channel">("channel");
  const [isNetworkFilterOpen, setIsNetworkFilterOpen] = useState(false);

  // L1 transactions (from DB)
  const [l1Transactions, setL1Transactions] = useState<Array<{
    type: string;
    txHash: string;
    date: string;
    timestamp: number;
  }>>([]);
  const [isLoadingL1Tx, setIsLoadingL1Tx] = useState(false);

  // Channel participant check (same validation as join-channel)
  const {
    isParticipant,
    isChecking: isCheckingParticipant,
    error: participantError,
    errorType,
    isValidChannelId,
    channelExists,
  } = useChannelParticipantCheck(channelIdInput);

  const [channelTargetContract, setChannelTargetContract] = useState<string | null>(null);
  useEffect(() => {
    if (!channelIdInput || !isValidBytes32(channelIdInput)) {
      setChannelTargetContract(null);
      return;
    }
    const fetchTargetContract = async () => {
      try {
        const response = await fetch(`/api/channels/${encodeURIComponent(channelIdInput.toLowerCase())}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.targetContract) {
            setChannelTargetContract(data.data.targetContract);
          }
        }
      } catch {
        // Ignore errors - will use default slot 0
      }
    };
    fetchTargetContract();
  }, [channelIdInput]);

  const { slotIndex } = useBalanceSlotIndex({ targetContract: channelTargetContract });

  const {
    generate,
    isGenerating: isComputing,
    accountInfo,
  } = useGenerateMptKey({
    channelId: channelIdInput || null,
    slotIndex: slotIndex ?? 0,
  });

  const l2Address = accountInfo?.l2Address || null;
  const mptKey = accountInfo?.mptKey || null;

  const {
    balance: channelBalance,
    balanceFormatted,
    tokenSymbol,
    isFromProof,
    proofNumber,
    isLoading: isLoadingBalance,
  } = useChannelUserBalance({
    channelId: isChannelLoaded ? channelIdInput : null,
    mptKey,
    tokenAddress: channelTargetContract,
  });

  const getTokenSymbolImage = (symbol: string) => {
    switch (symbol) {
      case "USDT":
        return USDTSymbol;
      case "USDC":
        return USDCSymbol;
      default:
        return TONSymbol;
    }
  };

  // Determine validation state
  const hasInput = Boolean(channelIdInput && channelIdInput.trim() !== "");
  const isFormatValid = hasInput && isValidBytes32(channelIdInput);
  const isChannelValid = isFormatValid && channelExists === true && isParticipant === true;

  // Log MPT Key to console when it's generated
  useEffect(() => {
    if (mptKey && isChannelLoaded && isChannelValid) {
      console.log("[AccountPanel] MPT Key:", mptKey);
    }
  }, [mptKey, isChannelLoaded, isChannelValid]);

  // Reset channel data when account changes
  useEffect(() => {
    if (prevAddressRef.current !== address) {
      // Account changed - reset all channel-related state
      setChannelIdInput("");
      setIsChannelLoaded(false);
      setCopiedL2Address(false);
      setL1Transactions([]);
      setTxNetworkType("channel");
      prevAddressRef.current = address;
    }
  }, [address]);

  const handleCopyL2Address = async () => {
    if (!l2Address) return;
    try {
      await navigator.clipboard.writeText(l2Address);
      setCopiedL2Address(true);
      setTimeout(() => setCopiedL2Address(false), 2000);
    } catch (err) {
      console.error("Failed to copy L2 address:", err);
    }
  };

  const handleConnect = () => {
    console.log('[AccountPanel] handleConnect called, connectors:', connectors.map(c => c.id));
    const injected = connectors.find((c) => c.id === "injected");
    if (injected) {
      console.log('[AccountPanel] Connecting with injected connector...');
      connect({ connector: injected }, {
        onSuccess: (data) => console.log('[AccountPanel] Connect success:', data),
        onError: (error) => console.error('[AccountPanel] Connect error:', error),
      });
    } else if (connectors[0]) {
      console.log('[AccountPanel] Connecting with first connector:', connectors[0].id);
      connect({ connector: connectors[0] });
    }
  };

  const handleCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  const computeL2Address = async () => {
    if (!channelIdInput || !isValidBytes32(channelIdInput)) return;
    await generate();
    setIsChannelLoaded(true);
  };

  // Reset loaded state when channel ID input changes
  const handleChannelIdChange = (value: string) => {
    setChannelIdInput(value);
    setIsChannelLoaded(false);
  };

  // Fetch L1 transactions from DB (open channel, initialize state)
  const fetchL1Transactions = useCallback(async () => {
    if (!channelIdInput || !isValidBytes32(channelIdInput)) {
      setL1Transactions([]);
      return;
    }

    setIsLoadingL1Tx(true);
    try {
      const normalizedChannelId = channelIdInput.toLowerCase();
      const encodedChannelId = encodeURIComponent(normalizedChannelId);

      const channelResponse = await fetch(`/api/channels/${encodedChannelId}`);
      if (!channelResponse.ok) {
        setL1Transactions([]);
        return;
      }

      const channelData = await channelResponse.json();
      if (!channelData.success || !channelData.data) {
        setL1Transactions([]);
        return;
      }

      const channel = channelData.data;
      const txs: Array<{
        type: string;
        txHash: string;
        date: string;
        timestamp: number;
      }> = [];

      // Open Channel transaction
      if (channel.openChannelTxHash) {
        const timestamp = channel.createdAt ? new Date(channel.createdAt).getTime() : Date.now();
        txs.push({
          type: "Open Channel",
          txHash: channel.openChannelTxHash,
          date: formatDate(timestamp),
          timestamp,
        });
      }

      // Initialize State transaction
      if (channel.initializationTxHash) {
        const timestamp = channel.initializedAt ? new Date(channel.initializedAt).getTime() : Date.now();
        txs.push({
          type: "Initialize State",
          txHash: channel.initializationTxHash,
          date: formatDate(timestamp),
          timestamp,
        });
      }

      // Sort by timestamp (most recent first)
      txs.sort((a, b) => b.timestamp - a.timestamp);
      setL1Transactions(txs);
    } catch (err) {
      console.error("[AccountPanel] Error fetching L1 transactions:", err);
      setL1Transactions([]);
    } finally {
      setIsLoadingL1Tx(false);
    }
  }, [channelIdInput]);

  // Format timestamp to date string
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) + " " + date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Auto-fetch L1 transactions when channel ID changes
  useEffect(() => {
    if (channelIdInput && isValidBytes32(channelIdInput)) {
      fetchL1Transactions();
    }
  }, [channelIdInput, fetchL1Transactions]);

  // Close account dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        accountDropdownRef.current &&
        !accountDropdownRef.current.contains(event.target as Node)
      ) {
        setIsAccountDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle add account request
  const handleAddAccount = async () => {
    await requestMoreAccounts();
    setIsAccountDropdownOpen(false);
  };

  const tokenInfo = channelTargetContract ? getTokenByAddress(channelTargetContract) : null;

  const {
    transactions: transactionHistory,
    isLoading: isLoadingHistory,
  } = useTransactionHistory({
    channelId: channelIdInput && isValidBytes32(channelIdInput) ? channelIdInput : null,
    decimals: tokenInfo?.decimals ?? 18,
    tokenSymbol: tokenInfo?.symbol ?? "TON",
    tokenAddress: channelTargetContract,
  });

  // Filter to only show "sent" transactions for Channel mode
  const sentTransactions = transactionHistory.filter((tx) => tx.type === "sent");

  // Network filter label mapping
  const networkLabels: Record<"sepolia" | "channel", string> = {
    sepolia: "Sepolia",
    channel: "Channel",
  };

  if (!isConnected) {
    return (
      <div className="font-mono flex flex-col gap-6" style={{ width: "100%" }}>
        <p className="text-[#999999]" style={{ fontSize: 16 }}>
          Connect your wallet to get started
        </p>
        <button
          onClick={handleConnect}
          disabled={isPending}
          data-testid="connect-wallet-button"
          className="flex items-center justify-center font-medium text-white transition-colors disabled:opacity-50"
          style={{
            height: 40,
            padding: "16px 24px",
            borderRadius: 4,
            border: "1px solid #111111",
            backgroundColor: "#2A72E5",
            fontSize: 16,
          }}
        >
          {isPending ? "Connecting..." : "Connect Wallet"}
        </button>
      </div>
    );
  }

  return (
    <div
      className="font-mono flex flex-col gap-6"
      style={{ width: "100%" }}
    >
      {/* Header: Account Dropdown + Copy + Disconnect */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Account Dropdown */}
          <div className="relative" ref={accountDropdownRef}>
            <button
              onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <span
                className="font-semibold text-[#111111]"
                style={{ fontSize: 24, lineHeight: "1.3em" }}
              >
                {formatAddress(address)}
              </span>
              <ChevronDown
                className={`w-5 h-5 text-[#111111] transition-transform ${
                  isAccountDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {isAccountDropdownOpen && (
              <div
                className="absolute left-0 mt-2 bg-white shadow-lg z-20"
                style={{
                  minWidth: 280,
                  border: "1px solid #DDDDDD",
                  borderRadius: 4,
                }}
              >
                {/* Account List */}
                <div className="py-1">
                  {isLoadingAccounts ? (
                    <div className="flex items-center justify-center py-3 px-4">
                      <Loader2 className="w-4 h-4 animate-spin text-[#999999]" />
                      <span className="ml-2 text-[#999999]" style={{ fontSize: 14 }}>
                        Loading accounts...
                      </span>
                    </div>
                  ) : accounts.length > 0 ? (
                    accounts.map((account) => (
                      <div
                        key={account.address}
                        className={`flex items-center justify-between px-4 py-2.5 ${
                          account.isActive
                            ? "bg-[#F5F9FF]"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {account.isActive && (
                            <Check className="w-4 h-4 text-[#2A72E5]" />
                          )}
                          <span
                            className={`font-mono ${
                              account.isActive ? "text-[#2A72E5] font-medium" : "text-[#111111]"
                            }`}
                            style={{ fontSize: 14 }}
                          >
                            {formatAddress(account.address)}
                          </span>
                          {account.isActive && (
                            <span
                              className="text-[#2A72E5]"
                              style={{ fontSize: 12 }}
                            >
                              (current)
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => handleCopyDropdownAddress(account.address, e)}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                          title={copiedDropdownAddress === account.address ? "Copied!" : "Copy address"}
                        >
                          {copiedDropdownAddress === account.address ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4 text-[#666666]" />
                          )}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-[#999999]" style={{ fontSize: 14 }}>
                      No accounts found
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-[#EEEEEE]" />

                {/* Switch Account Info */}
                {accounts.length > 1 && (
                  <div className="px-4 py-2 bg-[#F9F9F9]">
                    <p className="text-[#666666]" style={{ fontSize: 12, lineHeight: "1.4em" }}>
                      To switch accounts, click the account icon in MetaMask and select a different account.
                    </p>
                  </div>
                )}

                {/* Divider */}
                {accounts.length > 1 && <div className="border-t border-[#EEEEEE]" />}

                {/* Add Account Button */}
                <button
                  onClick={handleAddAccount}
                  disabled={isRequestingAccounts}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {isRequestingAccounts ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#2A72E5]" />
                  ) : (
                    <Plus className="w-4 h-4 text-[#2A72E5]" />
                  )}
                  <span className="text-[#2A72E5]" style={{ fontSize: 14 }}>
                    {isRequestingAccounts ? "Requesting..." : "Add Account"}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Copy Address Button */}
          <button
            onClick={handleCopyAddress}
            className="hover:opacity-70 transition-opacity"
            title={copiedAddress ? "Copied!" : "Copy address"}
          >
            <Copy
              className={`w-6 h-6 ${copiedAddress ? "text-green-600" : "text-[#111111]"}`}
            />
          </button>
        </div>
        <button
          onClick={() => {
            disconnect();
            onClose?.();
          }}
          className="flex items-center justify-center hover:bg-[#F2F2F2] transition-colors"
          style={{
            width: 48,
            height: 48,
            border: "1px solid #BBBBBB",
            borderRadius: 4,
          }}
          title="Disconnect"
        >
          <LogOut className="w-6 h-6 text-[#111111]" />
        </button>
      </div>

      {/* Channel ID Input Section (moved up) */}
      <div className="flex flex-col gap-3">
        <span
          className="font-medium text-[#111111]"
          style={{ fontSize: 20, lineHeight: "1.3em" }}
        >
          Channel ID
        </span>

        {/* Input + Load Button */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Enter Channel ID (0x...)"
                value={channelIdInput}
                onChange={(e) => handleChannelIdChange(e.target.value)}
                className={`w-full font-mono bg-transparent outline-none text-[#111111] placeholder:text-[#999999] ${
                  hasInput && (errorType !== null || !isFormatValid)
                    ? "border-[#E53935]"
                    : isChannelValid
                    ? "border-[#3EB100]"
                    : "border-[#BBBBBB]"
                }`}
                style={{
                  height: 40,
                  padding: "14px 16px",
                  paddingRight: 40,
                  border: `1px solid ${
                    hasInput && (errorType !== null || !isFormatValid)
                      ? "#E53935"
                      : isChannelValid
                      ? "#3EB100"
                      : "#BBBBBB"
                  }`,
                  borderRadius: 4,
                  fontSize: 16,
                  lineHeight: "1.3em",
                }}
              />
              {/* Status Icon */}
              {hasInput && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  {isCheckingParticipant ? (
                    <Loader2 className="w-5 h-5 animate-spin text-[#999999]" />
                  ) : errorType !== null || !isFormatValid ? (
                    <AlertCircle className="w-5 h-5 text-[#E53935]" />
                  ) : isChannelValid ? (
                    <CheckCircle className="w-5 h-5 text-[#3EB100]" />
                  ) : null}
                </div>
              )}
            </div>
            <button
              onClick={computeL2Address}
              disabled={isComputing || isCheckingParticipant || !isChannelValid}
              className="flex items-center justify-center font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                width: 100,
                height: 40,
                padding: "16px 24px",
                borderRadius: 4,
                border: "1px solid #111111",
                backgroundColor: "#2A72E5",
                fontSize: 16,
                lineHeight: "1.3em",
              }}
            >
              {isComputing || isCheckingParticipant ? "..." : "Load"}
            </button>
          </div>

          {/* Error Message */}
          {hasInput && participantError && (
            <p
              className="font-mono text-[#E53935]"
              style={{ fontSize: 13, marginLeft: 4 }}
            >
              {participantError}
            </p>
          )}
        </div>

        {/* L2 Address Result - Only show if channel is valid and loaded */}
        {isChannelLoaded && isChannelValid && l2Address && (
          <div className="flex flex-col gap-2">
            <span
              className="text-[#666666]"
              style={{ fontSize: 14, lineHeight: "1.3em" }}
            >
              L2 Address
            </span>
            <div
              className="relative"
              style={{
                padding: "14px 16px",
                paddingRight: 48,
                backgroundColor: "#F2F2F2",
                borderRadius: 4,
              }}
            >
              <span
                className="text-[#111111] break-all"
                style={{
                  fontSize: 16,
                  lineHeight: "1.3em",
                }}
              >
                {l2Address}
              </span>
              <button
                onClick={handleCopyL2Address}
                className="absolute top-3 right-3 hover:opacity-70 transition-opacity"
                title={copiedL2Address ? "Copied!" : "Copy L2 address"}
              >
                <Copy
                  className={`w-6 h-6 ${copiedL2Address ? "text-green-600" : "text-[#111111]"}`}
                />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Channel Balance Section (shows after channel ID is loaded and validated) */}
      {isChannelLoaded && isChannelValid && mptKey && (
        <div className="flex flex-col gap-4">
          <span
            className="font-medium text-[#111111]"
            style={{ fontSize: 20, lineHeight: "1.3em" }}
          >
            Channel Balance
          </span>
          <div className="flex flex-col">
            {isLoadingBalance ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#999999]" />
                <span className="text-[#999999]" style={{ fontSize: 14 }}>
                  Loading balance...
                </span>
              </div>
            ) : channelBalance !== null ? (
              <div
                className="flex items-center justify-between"
                style={{ padding: "10px 0", borderRadius: 4 }}
              >
                <div className="flex items-center gap-2">
                  <Image
                    src={getTokenSymbolImage(tokenSymbol)}
                    alt={tokenSymbol}
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                  <span
                    className="text-[#111111]"
                    style={{ fontSize: 18, lineHeight: "1.3em" }}
                  >
                    {balanceFormatted} {tokenSymbol}
                  </span>
                </div>
                <span
                  className="text-[#666666]"
                  style={{ fontSize: 14, lineHeight: "1.3em" }}
                >
                  {isFromProof ? `Proof #${proofNumber}` : "Initial Deposit"}
                </span>
              </div>
            ) : (
              <div className="py-2">
                <span className="text-[#999999]" style={{ fontSize: 14 }}>
                  No balance found
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transaction History - Show when channel is valid and loaded */}
      {isChannelLoaded && isChannelValid && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span
              className="font-medium text-[#111111]"
              style={{ fontSize: 20, lineHeight: "1.3em" }}
            >
              Transaction History
            </span>
            {/* Network Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsNetworkFilterOpen(!isNetworkFilterOpen)}
                className="flex items-center justify-between"
                style={{
                  width: 110,
                  height: 32,
                  padding: "7px 8px",
                  border: "1px solid #111111",
                  borderRadius: 4,
                }}
              >
                <span
                  className="font-medium text-[#111111]"
                  style={{ fontSize: 14, lineHeight: "1.3em" }}
                >
                  {networkLabels[txNetworkType]}
                </span>
                <ChevronDown 
                  className={`w-4 h-4 text-[#111111] transition-transform ${isNetworkFilterOpen ? "rotate-180" : ""}`} 
                />
              </button>
              {/* Dropdown Menu */}
              {isNetworkFilterOpen && (
                <div
                  className="absolute right-0 mt-1 bg-white shadow-lg z-10"
                  style={{
                    width: 110,
                    border: "1px solid #DDDDDD",
                    borderRadius: 4,
                  }}
                >
                  {(["sepolia", "channel"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setTxNetworkType(type);
                        setIsNetworkFilterOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 hover:bg-gray-100 ${
                        txNetworkType === type ? "bg-gray-50 font-medium" : ""
                      }`}
                      style={{ fontSize: 14 }}
                    >
                      {networkLabels[type]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Transaction List */}
          <div className="flex flex-col gap-2">
            {txNetworkType === "channel" ? (
              // Channel transactions (sent only)
              isLoadingHistory ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-[#999999]" />
                  <span className="ml-2 text-[#999999]" style={{ fontSize: 14 }}>
                    Loading...
                  </span>
                </div>
              ) : sentTransactions.length === 0 ? (
                <div className="text-center py-4">
                  <span className="text-[#999999]" style={{ fontSize: 14 }}>
                    No sent transactions
                  </span>
                </div>
              ) : (
                sentTransactions.map((tx, index) => (
                  <div
                    key={`${tx.sequenceNumber}-${index}`}
                    className="flex flex-col gap-1.5"
                    style={{
                      padding: "10px 16px",
                      border: "1px solid #DDDDDD",
                      borderRadius: 4,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[#E53935]"
                        style={{ fontSize: 12, lineHeight: "1.48em", fontWeight: 500 }}
                      >
                        Sent
                      </span>
                      <span
                        className="text-[#666666]"
                        style={{ fontSize: 12, lineHeight: "1.48em" }}
                      >
                        {tx.date}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Image
                        src={getTokenSymbolImage(tx.token)}
                        alt={tx.token}
                        width={24}
                        height={24}
                        className="rounded-full"
                      />
                      <span
                        className="text-[#E53935]"
                        style={{ fontSize: 14, lineHeight: "1.48em", fontWeight: 500 }}
                      >
                        -{tx.amountFormatted} {tx.token}
                      </span>
                    </div>
                  </div>
                ))
              )
            ) : (
              // Sepolia L1 transactions (open channel, initialize state)
              isLoadingL1Tx ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-[#999999]" />
                  <span className="ml-2 text-[#999999]" style={{ fontSize: 14 }}>
                    Loading...
                  </span>
                </div>
              ) : l1Transactions.length === 0 ? (
                <div className="text-center py-4">
                  <span className="text-[#999999]" style={{ fontSize: 14 }}>
                    No L1 transactions
                  </span>
                </div>
              ) : (
                l1Transactions.map((tx, index) => (
                  <div
                    key={`l1-${index}`}
                    className="flex flex-col gap-1.5"
                    style={{
                      padding: "10px 16px",
                      border: "1px solid #DDDDDD",
                      borderRadius: 4,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[#2A72E5]"
                        style={{ fontSize: 12, lineHeight: "1.48em", fontWeight: 500 }}
                      >
                        {tx.type}
                      </span>
                      <span
                        className="text-[#666666]"
                        style={{ fontSize: 12, lineHeight: "1.48em" }}
                      >
                        {tx.date}
                      </span>
                    </div>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#2A72E5] hover:underline truncate"
                      style={{ fontSize: 13, lineHeight: "1.48em" }}
                    >
                      {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}
                    </a>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
