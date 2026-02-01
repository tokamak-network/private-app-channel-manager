import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav";

export default function Layout() {
  return (
    <div className="w-[360px] h-[600px] bg-background text-text-primary flex flex-col overflow-hidden">
      <header className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-sm text-text-secondary">Sepolia</span>
        </div>
        <button className="px-3 py-1.5 bg-surface rounded-card text-sm font-medium hover:bg-surface-hover transition-colors">
          0x1234...5678
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
