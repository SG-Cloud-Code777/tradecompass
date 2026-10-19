import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { GlossaryProvider } from './components/Term';
import './index.css';
import { MarketProvider } from './lib/market';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <MarketProvider>
        <GlossaryProvider>
          <App />
        </GlossaryProvider>
      </MarketProvider>
    </BrowserRouter>
  </StrictMode>,
);
