import { Wallet, ArrowUpRight, ArrowDownLeft } from "lucide-react";

export default function Home() {
  return (
    <div className="p-4 space-y-4">
      <div className="bg-surface rounded-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary text-sm">Total Balance</span>
          <Wallet className="w-4 h-4 text-text-tertiary" />
        </div>
        <div className="text-2xl font-semibold">0.00 TON</div>
        <div className="text-sm text-text-secondary">≈ $0.00 USD</div>
      </div>

      <div className="flex gap-3">
        <button className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white py-3 rounded-card font-medium transition-colors">
          <ArrowUpRight className="w-4 h-4" />
          Send
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-surface-hover text-text-primary py-3 rounded-card font-medium transition-colors border border-border">
          <ArrowDownLeft className="w-4 h-4" />
          Receive
        </button>
      </div>

      <div className="bg-surface rounded-card p-4">
        <h3 className="text-sm font-medium mb-3">Channel Info</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Status</span>
            <span className="text-success">Active</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Participants</span>
            <span>—</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Channel ID</span>
            <span className="font-mono text-text-secondary">Not joined</span>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-card p-4">
        <h3 className="text-sm font-medium mb-3">Recent Activity</h3>
        <div className="text-sm text-text-secondary text-center py-6">
          No recent transactions
        </div>
      </div>
    </div>
  );
}
