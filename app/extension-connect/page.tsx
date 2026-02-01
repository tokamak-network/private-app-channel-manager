"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useEffect, useState } from "react";
import { injected } from "wagmi/connectors";

const WALLET_STORAGE_KEY = "tokamak_connected_wallet";

export default function ExtensionConnectPage() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConnect = async () => {
    setStatus("connecting");
    setErrorMessage(null);
    try {
      await connect({ connector: injected() });
    } catch (e) {
      setStatus("error");
      setErrorMessage(e instanceof Error ? e.message : "Connection failed");
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      setStatus("connected");
      sendAddressToExtension(address);
    }
  }, [isConnected, address]);

  const sendAddressToExtension = (addr: string) => {
    localStorage.setItem(WALLET_STORAGE_KEY, addr);
    window.postMessage({ type: "TOKAMAK_WALLET_CONNECTED", address: addr }, "*");
  };

  const handleDisconnect = () => {
    disconnect();
    localStorage.removeItem(WALLET_STORAGE_KEY);
    setStatus("idle");
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center p-4">
      <div className="bg-[#24272a] rounded-2xl p-8 max-w-md w-full shadow-xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-[#037DD6] to-[#1098FC] rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Connect Wallet
          </h1>
          <p className="text-gray-400 text-sm">
            Connect your wallet to use Tokamak Channels Extension
          </p>
        </div>

        {status === "connected" && address ? (
          <div className="space-y-4">
            <div className="bg-[#1a1a2e] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-1">Connected Address</p>
              <p className="text-white font-mono text-sm break-all">{address}</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <p className="text-green-400 text-sm text-center">
                ✓ Connected! You can close this tab and return to the extension.
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              className="w-full py-3 bg-red-500/10 text-red-400 rounded-xl font-medium hover:bg-red-500/20 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <p className="text-red-400 text-sm">{errorMessage}</p>
              </div>
            )}
            <button
              onClick={handleConnect}
              disabled={isPending || status === "connecting"}
              className="w-full py-4 bg-[#037DD6] text-white rounded-xl font-medium hover:bg-[#0260a8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {isPending || status === "connecting" ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" viewBox="0 0 40 40" fill="none">
                    <path d="M37.5 20c0 9.665-7.835 17.5-17.5 17.5S2.5 29.665 2.5 20 10.335 2.5 20 2.5 37.5 10.335 37.5 20z" fill="#F6851B"/>
                    <path d="M32.9 10.4l-9.7 7.2 1.8-4.2 7.9-3z" fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7.1 10.4l9.6 7.3-1.7-4.3-7.9-3zM29.3 26.2l-2.6 4 5.5 1.5 1.6-5.4-4.5-.1zM6.2 26.3l1.6 5.4 5.5-1.5-2.6-4-4.5.1z" fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Connect with MetaMask
                </>
              )}
            </button>
            <p className="text-gray-500 text-xs text-center">
              Make sure MetaMask is installed and unlocked
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
