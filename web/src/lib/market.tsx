import type { Market } from '@tradecompass/signals';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const Ctx = createContext<{ market: Market; setMarket: (m: Market) => void }>({ market: 'US', setMarket: () => {} });

const read = (): Market => {
  try {
    return localStorage.getItem('market') === 'CA' ? 'CA' : 'US';
  } catch {
    return 'US';
  }
};

export function MarketProvider({ children }: { children: ReactNode }) {
  const [market, setMarket] = useState<Market>(read);
  useEffect(() => {
    try {
      localStorage.setItem('market', market);
    } catch {
      // private mode — keep in memory only
    }
  }, [market]);
  return <Ctx.Provider value={{ market, setMarket }}>{children}</Ctx.Provider>;
}

export const useMarket = () => useContext(Ctx);
export const marketOf = (symbol: string): Market => (/\.(TO|V)$/i.test(symbol) ? 'CA' : 'US');
export const currencyOf = (m: Market) => (m === 'US' ? 'USD' : 'CAD');
