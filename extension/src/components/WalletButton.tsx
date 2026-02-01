import { useState, useEffect } from 'react';
import { ChevronDown, LogOut, Wallet } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const WALLET_STORAGE_KEY = 'tokamak_connected_wallet';

export default function WalletButton() {
  const { settings } = useSettings();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [savedAddress, setSavedAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(WALLET_STORAGE_KEY, (result) => {
        if (result[WALLET_STORAGE_KEY]) {
          setSavedAddress(result[WALLET_STORAGE_KEY]);
        }
        setIsLoading(false);
      });
    } else {
      const stored = localStorage.getItem(WALLET_STORAGE_KEY);
      if (stored) setSavedAddress(stored);
      setIsLoading(false);
    }
  }, []);

  const handleConnect = () => {
    const serverUrl = settings.leaderServerUrl || 'http://localhost:3000';
    window.open(`${serverUrl}/extension-connect`, '_blank');
  };

  const handleDisconnect = () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.remove(WALLET_STORAGE_KEY);
    } else {
      localStorage.removeItem(WALLET_STORAGE_KEY);
    }
    setSavedAddress(null);
    setIsDropdownOpen(false);
  };

  if (isLoading) {
    return (
      <div className="px-3 py-1.5 text-sm text-text-secondary">
        Loading...
      </div>
    );
  }

  if (!savedAddress) {
    return (
      <button
        onClick={handleConnect}
        className="flex items-center gap-2 px-3 py-1.5 bg-primary rounded-button text-sm font-medium hover:bg-primary-hover transition-colors"
      >
        <Wallet className="w-4 h-4" />
        Connect
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-card text-sm font-medium hover:bg-surface-hover transition-colors"
      >
        <span>{formatAddress(savedAddress)}</span>
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
              onClick={handleDisconnect}
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
