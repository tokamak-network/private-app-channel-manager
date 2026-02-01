import { useState, useEffect, useCallback } from 'react';

export interface ExtensionSettings {
  rpcUrl: string;
  leaderServerUrl: string;
  channelId: string;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  rpcUrl: 'https://rpc.sepolia.org',
  leaderServerUrl: '',
  channelId: '',
};

const STORAGE_KEY = 'tokamak_extension_settings';

export function useSettings() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const result = await chrome.storage.sync.get(STORAGE_KEY);
        if (result[STORAGE_KEY]) {
          setSettings({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] });
        }
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveSettings = useCallback(async (newSettings: Partial<ExtensionSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        await chrome.storage.sync.set({ [STORAGE_KEY]: updated });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      return false;
    }
  }, [settings]);

  const testRpcConnection = useCallback(async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: 1,
        }),
      });
      const data = await response.json();
      return data.result === '0xaa36a7';
    } catch {
      return false;
    }
  }, []);

  const testServerConnection = useCallback(async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(`${url}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    settings,
    isLoading,
    saveSettings,
    testRpcConnection,
    testServerConnection,
  };
}
