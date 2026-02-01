import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowUpRight, ArrowDownLeft, RefreshCw, Search, Copy, Check } from 'lucide-react';
import { useChannelInfo } from '../hooks/useChannelInfo';
import { useSettings } from '../hooks/useSettings';

const WALLET_STORAGE_KEY = 'tokamak_connected_wallet';

const stateColors: Record<string, string> = {
  None: 'text-text-tertiary',
  Initialized: 'text-warning',
  Open: 'text-success',
  Closing: 'text-warning',
  Closed: 'text-error',
};

export default function Home() {
  const [savedAddress, setSavedAddress] = useState<string | null>(null);
  
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(WALLET_STORAGE_KEY, (result) => {
        setSavedAddress(result[WALLET_STORAGE_KEY] || null);
      });
    } else {
      setSavedAddress(localStorage.getItem(WALLET_STORAGE_KEY));
    }
  }, []);

  const isConnected = !!savedAddress;
  const navigate = useNavigate();
  const { settings, saveSettings } = useSettings();
  const { channelInfo, isLoading, hasValidChannelId } = useChannelInfo();

  const [channelIdInput, setChannelIdInput] = useState(settings.channelId || '');
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    setChannelIdInput(settings.channelId || '');
  }, [settings.channelId]);

  const handleLoadChannel = async () => {
    if (channelIdInput && channelIdInput.startsWith('0x') && channelIdInput.length === 66) {
      await saveSettings({ channelId: channelIdInput });
    }
  };

  const handleCopyId = async () => {
    if (settings.channelId) {
      await navigator.clipboard.writeText(settings.channelId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="p-4 space-y-4">
      <div className="bg-surface rounded-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary text-sm">Channel ID</span>
          {hasValidChannelId && (
            <button
              onClick={handleCopyId}
              className="p-1 hover:bg-surface-hover rounded transition-colors"
            >
              {copiedId ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4 text-text-tertiary" />
              )}
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={channelIdInput}
            onChange={(e) => setChannelIdInput(e.target.value)}
            placeholder="0x..."
            className="flex-1 bg-background border border-border rounded-button px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleLoadChannel}
            disabled={!channelIdInput || channelIdInput.length !== 66}
            className="px-3 py-2 bg-primary rounded-button text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      {hasValidChannelId && channelInfo && (
        <>
          <div className="bg-surface rounded-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary text-sm">Channel Balance</span>
              <Wallet className="w-4 h-4 text-text-tertiary" />
            </div>
            <div className="text-2xl font-semibold">
              {channelInfo.state === 'None' ? '—' : '0.00 TON'}
            </div>
            <div className="text-sm text-text-secondary">≈ $0.00 USD</div>
          </div>

          <div className="flex gap-3">
            {channelInfo.state === 'Closed' ? (
              <button
                onClick={() => navigate('/withdraw')}
                className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white py-3 rounded-card font-medium transition-colors"
              >
                <ArrowDownLeft className="w-4 h-4" />
                Withdraw
              </button>
            ) : (
              <>
                <button
                  disabled={channelInfo.state !== 'Open'}
                  onClick={() => navigate('/send')}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white py-3 rounded-card font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Send
                </button>
                <button
                  disabled={channelInfo.state !== 'Initialized'}
                  onClick={() => navigate('/deposit')}
                  className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-surface-hover text-text-primary py-3 rounded-card font-medium transition-colors border border-border disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  Deposit
                </button>
              </>
            )}
          </div>

          <div className="bg-surface rounded-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Channel Info</h3>
              {isLoading && <RefreshCw className="w-4 h-4 animate-spin text-text-tertiary" />}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Status</span>
                <span className={stateColors[channelInfo.state] || 'text-text-primary'}>
                  {channelInfo.state}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Participants</span>
                <span>{channelInfo.participantCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Leader</span>
                <span className="font-mono text-xs">
                  {channelInfo.leader ? formatAddress(channelInfo.leader) : '—'}
                </span>
              </div>
              {isConnected && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Your Status</span>
                  <span
                    className={
                      channelInfo.isParticipant
                        ? 'text-success'
                        : channelInfo.isWhitelisted
                          ? 'text-warning'
                          : 'text-error'
                    }
                  >
                    {channelInfo.isParticipant
                      ? 'Participant'
                      : channelInfo.isWhitelisted
                        ? 'Whitelisted'
                        : 'Not Whitelisted'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!hasValidChannelId && (
        <div className="bg-surface rounded-card p-6 text-center">
          <Wallet className="w-12 h-12 mx-auto mb-3 text-text-tertiary" />
          <h3 className="text-sm font-medium mb-1">No Channel Selected</h3>
          <p className="text-xs text-text-secondary">
            Enter a channel ID above to view channel information
          </p>
        </div>
      )}
    </div>
  );
}
