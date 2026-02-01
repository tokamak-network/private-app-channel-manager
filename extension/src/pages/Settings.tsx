import { useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import {
  Server,
  Globe,
  Info,
  ExternalLink,
  Check,
  X,
  Loader2,
  LogOut,
} from 'lucide-react';
import { useSettings } from '../hooks/useSettings';

export default function Settings() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { settings, saveSettings, testRpcConnection, testServerConnection } =
    useSettings();

  const [rpcUrl, setRpcUrl] = useState(settings.rpcUrl);
  const [serverUrl, setServerUrl] = useState(settings.leaderServerUrl);
  const [rpcStatus, setRpcStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [serverStatus, setServerStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [isSaving, setIsSaving] = useState(false);

  const handleTestRpc = async () => {
    setRpcStatus('testing');
    const isValid = await testRpcConnection(rpcUrl);
    setRpcStatus(isValid ? 'success' : 'error');
  };

  const handleTestServer = async () => {
    if (!serverUrl) {
      setServerStatus('error');
      return;
    }
    setServerStatus('testing');
    const isValid = await testServerConnection(serverUrl);
    setServerStatus(isValid ? 'success' : 'error');
  };

  const handleSave = async () => {
    setIsSaving(true);
    await saveSettings({
      rpcUrl,
      leaderServerUrl: serverUrl,
    });
    setIsSaving(false);
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const StatusIcon = ({ status }: { status: 'idle' | 'testing' | 'success' | 'error' }) => {
    switch (status) {
      case 'testing':
        return <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />;
      case 'success':
        return <Check className="w-4 h-4 text-success" />;
      case 'error':
        return <X className="w-4 h-4 text-error" />;
      default:
        return null;
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Settings</h2>

      <div className="bg-surface rounded-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium">RPC URL</h3>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="url"
              value={rpcUrl}
              onChange={(e) => {
                setRpcUrl(e.target.value);
                setRpcStatus('idle');
              }}
              placeholder="https://rpc.sepolia.org"
              className="flex-1 bg-background border border-border rounded-button px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
            <button
              onClick={handleTestRpc}
              disabled={rpcStatus === 'testing'}
              className="px-3 py-2 bg-background border border-border rounded-button text-sm hover:bg-surface-hover transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {rpcStatus === 'testing' ? 'Testing...' : 'Test'}
              <StatusIcon status={rpcStatus} />
            </button>
          </div>
          <p className="text-xs text-text-tertiary">
            Sepolia network RPC endpoint (Chain ID: 11155111)
          </p>
        </div>
      </div>

      <div className="bg-surface rounded-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium">Leader Server URL</h3>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => {
                setServerUrl(e.target.value);
                setServerStatus('idle');
              }}
              placeholder="http://localhost:3000"
              className="flex-1 bg-background border border-border rounded-button px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
            <button
              onClick={handleTestServer}
              disabled={serverStatus === 'testing' || !serverUrl}
              className="px-3 py-2 bg-background border border-border rounded-button text-sm hover:bg-surface-hover transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {serverStatus === 'testing' ? 'Testing...' : 'Test'}
              <StatusIcon status={serverStatus} />
            </button>
          </div>
          <p className="text-xs text-text-tertiary">
            URL of the channel leader's server for L2 transactions
          </p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-3 bg-primary rounded-button text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </>
        ) : (
          'Save Settings'
        )}
      </button>

      {isConnected && (
        <div className="bg-surface rounded-card p-4">
          <h3 className="text-sm font-medium mb-3">Connected Wallet</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-light" />
              <div>
                <div className="text-sm font-mono">{formatAddress(address!)}</div>
                <div className="text-xs text-success">Connected</div>
              </div>
            </div>
            <button
              onClick={() => disconnect()}
              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-error/10 text-error rounded-button hover:bg-error/20 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              Disconnect
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium">About</h3>
        </div>
        <p className="text-xs text-text-secondary">
          Tokamak Private App Channels Extension v0.1.0
        </p>
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
    </div>
  );
}
