import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useState } from 'react';
import { ChevronDown, LogOut, Wallet } from 'lucide-react';

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleConnect = () => {
    const injectedConnector = connectors.find((c) => c.id === 'injected');
    if (injectedConnector) {
      connect({ connector: injectedConnector });
    }
  };

  if (!isConnected) {
    return (
      <button
        onClick={handleConnect}
        disabled={isPending}
        className="flex items-center gap-2 px-3 py-1.5 bg-primary rounded-button text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
      >
        <Wallet className="w-4 h-4" />
        {isPending ? 'Connecting...' : 'Connect'}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-card text-sm font-medium hover:bg-surface-hover transition-colors"
      >
        <span>{formatAddress(address!)}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isDropdownOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsDropdownOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-card shadow-elevated z-20">
            <button
              onClick={() => {
                disconnect();
                setIsDropdownOpen(false);
              }}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-error hover:bg-surface-hover transition-colors rounded-card"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
