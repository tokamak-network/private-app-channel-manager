import { Key, Globe, Info, ExternalLink, ChevronRight } from "lucide-react";

export default function Settings() {
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Settings</h2>

      <div className="bg-surface rounded-card divide-y divide-border">
        <button className="w-full flex items-center gap-3 p-4 hover:bg-surface-hover transition-colors">
          <div className="p-2 rounded-full bg-background">
            <Key className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium">L2 Key Management</div>
            <div className="text-xs text-text-secondary">
              View and manage your MPT key
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-text-tertiary" />
        </button>

        <button className="w-full flex items-center gap-3 p-4 hover:bg-surface-hover transition-colors">
          <div className="p-2 rounded-full bg-background">
            <Globe className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium">Network</div>
            <div className="text-xs text-text-secondary">Sepolia Testnet</div>
          </div>
          <ChevronRight className="w-4 h-4 text-text-tertiary" />
        </button>

        <button className="w-full flex items-center gap-3 p-4 hover:bg-surface-hover transition-colors">
          <div className="p-2 rounded-full bg-background">
            <Info className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium">About</div>
            <div className="text-xs text-text-secondary">Version 0.1.0</div>
          </div>
          <ChevronRight className="w-4 h-4 text-text-tertiary" />
        </button>
      </div>

      <div className="bg-surface rounded-card p-4">
        <h3 className="text-sm font-medium mb-3">Connected Wallet</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-light" />
            <div>
              <div className="text-sm font-mono">0x1234...5678</div>
              <div className="text-xs text-text-secondary">Not connected</div>
            </div>
          </div>
          <button className="text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-button hover:bg-primary/20 transition-colors">
            Connect
          </button>
        </div>
      </div>

      <a
        href="https://github.com/tokamak-network"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors py-2"
      >
        <span>View on GitHub</span>
        <ExternalLink className="w-3 h-3" />
      </a>

      <div className="text-center text-xs text-text-tertiary">
        Tokamak Private App Channels
      </div>
    </div>
  );
}
