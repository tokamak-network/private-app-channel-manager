import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { WagmiProvider } from '@/providers/WagmiProvider';
import App from './App';
import '@/styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </WagmiProvider>
  </React.StrictMode>
);
