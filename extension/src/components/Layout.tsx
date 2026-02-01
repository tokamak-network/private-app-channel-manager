import { Outlet } from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import BottomNav from './BottomNav';
import WalletButton from './WalletButton';
import { SEPOLIA_CHAIN_ID } from '../lib/wagmi';

export default function Layout() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const isCorrectNetwork = chainId === SEPOLIA_CHAIN_ID;

  return (
    <div className="w-[360px] h-[600px] bg-background text-text-primary flex flex-col overflow-hidden">
      <header className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {isConnected && isCorrectNetwork && (
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          )}
          {isConnected && !isCorrectNetwork && (
            <div className="w-2 h-2 rounded-full bg-error" />
          )}
          <span className="text-sm text-text-secondary">
            {isConnected ? (isCorrectNetwork ? 'Sepolia' : 'Wrong Network') : 'Not Connected'}
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
