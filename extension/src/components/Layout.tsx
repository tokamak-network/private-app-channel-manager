import { Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import BottomNav from './BottomNav';
import WalletButton from './WalletButton';

const WALLET_STORAGE_KEY = 'tokamak_connected_wallet';

export default function Layout() {
  const [savedAddress, setSavedAddress] = useState<string | null>(null);

  useEffect(() => {
    const loadAddress = () => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(WALLET_STORAGE_KEY, (result) => {
          setSavedAddress(result[WALLET_STORAGE_KEY] || null);
        });
      } else {
        setSavedAddress(localStorage.getItem(WALLET_STORAGE_KEY));
      }
    };

    loadAddress();

    const handleStorageChange = () => loadAddress();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const isConnected = !!savedAddress;

  return (
    <div className="w-[360px] h-[600px] bg-background text-text-primary flex flex-col overflow-hidden">
      <header className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {isConnected && (
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          )}
          <span className="text-sm text-text-secondary">
            {isConnected ? 'Sepolia' : 'Not Connected'}
          </span>
        </div>
        <WalletButton />
      </header>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
