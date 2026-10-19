import type { Market, SectorId } from '@tradecompass/signals';

/**
 * Seed universe: tickers and metadata only (no prices). Users can add any other ticker from search.
 * Flags: E = ETF, R = REIT, V = TSX Venture, H = CAD-hedged, L = leveraged.
 */
type Row = [symbol: string, name: string, exchange: string, flags?: string, notes?: string];

const US: Record<SectorId, Row[]> = {
  gold: [
    ['NEM', 'Newmont Corp', 'NYSE'],
    ['AEM', 'Agnico Eagle Mines', 'NYSE'],
    ['B', 'Barrick Mining Corp', 'NYSE'],
    ['GLD', 'SPDR Gold Shares', 'NYSE Arca', 'E'],
    ['GDX', 'VanEck Gold Miners ETF', 'NYSE Arca', 'E'],
  ],
  silver: [
    ['PAAS', 'Pan American Silver', 'NASDAQ'],
    ['AG', 'First Majestic Silver', 'NYSE'],
    ['HL', 'Hecla Mining', 'NYSE'],
    ['SLV', 'iShares Silver Trust', 'NYSE Arca', 'E'],
    ['SIL', 'Global X Silver Miners ETF', 'NYSE Arca', 'E'],
  ],
  copper: [
    ['FCX', 'Freeport-McMoRan', 'NYSE'],
    ['SCCO', 'Southern Copper', 'NYSE'],
    ['COPX', 'Global X Copper Miners ETF', 'NYSE Arca', 'E'],
    ['CPER', 'United States Copper Index Fund', 'NYSE Arca', 'E'],
  ],
  oil_gas: [
    ['XOM', 'Exxon Mobil', 'NYSE'],
    ['CVX', 'Chevron', 'NYSE'],
    ['COP', 'ConocoPhillips', 'NYSE'],
    ['OXY', 'Occidental Petroleum', 'NYSE'],
    ['XLE', 'Energy Select Sector SPDR', 'NYSE Arca', 'E'],
  ],
  semis: [
    ['NVDA', 'NVIDIA', 'NASDAQ'],
    ['AMD', 'Advanced Micro Devices', 'NASDAQ'],
    ['AVGO', 'Broadcom', 'NASDAQ'],
    ['TSM', 'Taiwan Semiconductor (ADR)', 'NYSE'],
    ['MU', 'Micron Technology', 'NASDAQ'],
    ['INTC', 'Intel', 'NASDAQ'],
    ['SMH', 'VanEck Semiconductor ETF', 'NASDAQ', 'E'],
  ],
  robotics_ai: [
    ['MSFT', 'Microsoft', 'NASDAQ'],
    ['GOOGL', 'Alphabet (Class A)', 'NASDAQ'],
    ['PLTR', 'Palantir Technologies', 'NASDAQ'],
    ['ISRG', 'Intuitive Surgical', 'NASDAQ'],
    ['ROK', 'Rockwell Automation', 'NYSE'],
    ['BOTZ', 'Global X Robotics & AI ETF', 'NASDAQ', 'E'],
  ],
  mining: [
    ['CCJ', 'Cameco (uranium)', 'NYSE'],
    ['URA', 'Global X Uranium ETF', 'NYSE Arca', 'E'],
    ['ALB', 'Albemarle (lithium)', 'NYSE'],
    ['LIT', 'Global X Lithium & Battery Tech ETF', 'NYSE Arca', 'E'],
    ['MP', 'MP Materials (rare earths)', 'NYSE'],
  ],
  food_ag: [
    ['ADM', 'Archer-Daniels-Midland', 'NYSE'],
    ['DE', 'Deere & Co', 'NYSE'],
    ['CTVA', 'Corteva', 'NYSE'],
    ['BG', 'Bunge Global', 'NYSE'],
    ['MOO', 'VanEck Agribusiness ETF', 'NYSE Arca', 'E'],
  ],
  reits: [
    ['O', 'Realty Income', 'NYSE', 'R'],
    ['PLD', 'Prologis', 'NYSE', 'R'],
    ['AMT', 'American Tower', 'NYSE', 'R'],
    ['EQIX', 'Equinix', 'NASDAQ', 'R'],
    ['SPG', 'Simon Property Group', 'NYSE', 'R'],
    ['VNQ', 'Vanguard Real Estate ETF', 'NYSE Arca', 'E'],
  ],
  etfs: [
    ['SPY', 'SPDR S&P 500 ETF', 'NYSE Arca', 'E'],
    ['VOO', 'Vanguard S&P 500 ETF', 'NYSE Arca', 'E'],
    ['QQQ', 'Invesco QQQ (Nasdaq-100)', 'NASDAQ', 'E'],
    ['VTI', 'Vanguard Total Stock Market ETF', 'NYSE Arca', 'E'],
    ['IWM', 'iShares Russell 2000 ETF', 'NYSE Arca', 'E'],
    ['TQQQ', 'ProShares UltraPro QQQ (3x)', 'NASDAQ', 'EL', 'Leveraged — daily reset, decays over time.'],
  ],
  dividend: [
    ['JNJ', 'Johnson & Johnson', 'NYSE'],
    ['KO', 'Coca-Cola', 'NYSE'],
    ['PG', 'Procter & Gamble', 'NYSE'],
    ['PEP', 'PepsiCo', 'NASDAQ'],
    ['VZ', 'Verizon', 'NYSE'],
    ['SCHD', 'Schwab US Dividend Equity ETF', 'NYSE Arca', 'E'],
  ],
};

const CA: Record<SectorId, Row[]> = {
  gold: [
    ['ABX.TO', 'Barrick Mining Corp', 'TSX'],
    ['AEM.TO', 'Agnico Eagle Mines', 'TSX'],
    ['K.TO', 'Kinross Gold', 'TSX'],
    ['WPM.TO', 'Wheaton Precious Metals', 'TSX'],
    ['FNV.TO', 'Franco-Nevada', 'TSX'],
    ['XGD.TO', 'iShares S&P/TSX Global Gold Index ETF', 'TSX', 'E'],
    ['SGD.V', 'Snowline Gold', 'TSXV', 'V', 'Pre-production explorer.'],
  ],
  silver: [
    ['PAAS.TO', 'Pan American Silver', 'TSX'],
    ['FR.TO', 'First Majestic Silver', 'TSX'],
    ['SVM.TO', 'Silvercorp Metals', 'TSX'],
  ],
  copper: [
    ['TECK-B.TO', 'Teck Resources (Class B)', 'TSX'],
    ['FM.TO', 'First Quantum Minerals', 'TSX'],
    ['HBM.TO', 'Hudbay Minerals', 'TSX'],
    ['CS.TO', 'Capstone Copper', 'TSX'],
    ['IVN.TO', 'Ivanhoe Mines', 'TSX'],
  ],
  oil_gas: [
    ['CNQ.TO', 'Canadian Natural Resources', 'TSX'],
    ['SU.TO', 'Suncor Energy', 'TSX'],
    ['CVE.TO', 'Cenovus Energy', 'TSX'],
    ['TOU.TO', 'Tourmaline Oil (natural gas)', 'TSX'],
    ['ENB.TO', 'Enbridge (pipelines)', 'TSX'],
    ['XEG.TO', 'iShares S&P/TSX Capped Energy ETF', 'TSX', 'E'],
  ],
  semis: [
    ['CLS.TO', 'Celestica', 'TSX'],
    ['CHPS.TO', 'Global X Semiconductor Index ETF', 'TSX', 'E'],
    ['XIT.TO', 'iShares S&P/TSX Capped Info Tech ETF', 'TSX', 'E'],
  ],
  robotics_ai: [
    ['SHOP.TO', 'Shopify', 'TSX'],
    ['OTEX.TO', 'Open Text', 'TSX'],
    ['KXS.TO', 'Kinaxis', 'TSX'],
    ['DSG.TO', 'Descartes Systems', 'TSX'],
    ['ATS.TO', 'ATS Corp (automation)', 'TSX'],
  ],
  mining: [
    ['CCO.TO', 'Cameco (uranium)', 'TSX'],
    ['NXE.TO', 'NexGen Energy (uranium)', 'TSX'],
    ['DML.TO', 'Denison Mines (uranium)', 'TSX'],
    ['LUN.TO', 'Lundin Mining', 'TSX'],
    ['SLI.V', 'Standard Lithium', 'TSXV', 'V', 'Development-stage lithium.'],
  ],
  food_ag: [
    ['NTR.TO', 'Nutrien (fertilizer)', 'TSX'],
    ['SAP.TO', 'Saputo', 'TSX'],
    ['L.TO', 'Loblaw Companies', 'TSX'],
    ['MRU.TO', 'Metro Inc', 'TSX'],
    ['COW.TO', 'iShares Global Agriculture Index ETF', 'TSX', 'E'],
  ],
  reits: [
    ['REI-UN.TO', 'RioCan REIT', 'TSX', 'R'],
    ['CAR-UN.TO', 'Canadian Apartment Properties REIT', 'TSX', 'R'],
    ['GRT-UN.TO', 'Granite REIT (industrial)', 'TSX', 'R'],
    ['CHP-UN.TO', 'Choice Properties REIT', 'TSX', 'R'],
    ['ZRE.TO', 'BMO Equal Weight REITs ETF', 'TSX', 'E'],
  ],
  etfs: [
    ['XIU.TO', 'iShares S&P/TSX 60 ETF', 'TSX', 'E'],
    ['XEQT.TO', 'iShares Core Equity ETF Portfolio', 'TSX', 'E'],
    ['VFV.TO', 'Vanguard S&P 500 ETF (unhedged)', 'TSX', 'E'],
    ['VSP.TO', 'Vanguard S&P 500 ETF (CAD-hedged)', 'TSX', 'EH'],
    ['XSP.TO', 'iShares Core S&P 500 ETF (CAD-hedged)', 'TSX', 'EH'],
    ['ZQQ.TO', 'BMO Nasdaq 100 Equity Hedged to CAD ETF', 'TSX', 'EH'],
  ],
  dividend: [
    ['RY.TO', 'Royal Bank of Canada', 'TSX'],
    ['TD.TO', 'Toronto-Dominion Bank', 'TSX'],
    ['BNS.TO', 'Bank of Nova Scotia', 'TSX'],
    ['FTS.TO', 'Fortis', 'TSX'],
    ['BCE.TO', 'BCE Inc', 'TSX'],
    ['T.TO', 'TELUS', 'TSX'],
    ['VDY.TO', 'Vanguard FTSE Canadian High Dividend Yield ETF', 'TSX', 'E'],
  ],
};

export interface UniverseEntry {
  symbol: string;
  name: string;
  market: Market;
  exchange: string;
  currency: 'USD' | 'CAD';
  sector: SectorId;
  kind: 'stock' | 'etf' | 'reit';
  isVenture: boolean;
  isLeveraged: boolean;
  cadHedged: boolean;
  notes: string | null;
}

function expand(market: Market, table: Record<SectorId, Row[]>): UniverseEntry[] {
  return Object.entries(table).flatMap(([sector, rows]) =>
    rows.map(([symbol, name, exchange, flags = '', notes]) => ({
      symbol,
      name,
      market,
      exchange,
      currency: market === 'US' ? 'USD' : 'CAD',
      sector: sector as SectorId,
      kind: flags.includes('E') ? 'etf' : flags.includes('R') ? 'reit' : 'stock',
      isVenture: flags.includes('V'),
      isLeveraged: flags.includes('L'),
      cadHedged: flags.includes('H'),
      notes: notes ?? null,
    })),
  );
}

export const UNIVERSE: UniverseEntry[] = [...expand('US', US), ...expand('CA', CA)];

/**
 * Institutional managers that file 13F-HR with the SEC. CIKs from EDGAR company search.
 * Index giants (Vanguard, BlackRock) are untracked by default: their filings are huge and say little about conviction.
 */
export const SEED_FUNDS: { name: string; cik: string; country: string; style: string; tracked: boolean }[] = [
  { name: 'Berkshire Hathaway', cik: '0001067983', country: 'US', style: 'Value (Buffett)', tracked: true },
  { name: 'Bridgewater Associates', cik: '0001350694', country: 'US', style: 'Global macro', tracked: true },
  { name: 'Pershing Square Capital', cik: '0001336528', country: 'US', style: 'Activist (Ackman)', tracked: true },
  { name: 'ARK Investment Management', cik: '0001697748', country: 'US', style: 'Disruptive growth', tracked: true },
  { name: 'Renaissance Technologies', cik: '0001037389', country: 'US', style: 'Quant', tracked: true },
  { name: 'Soros Fund Management', cik: '0001029160', country: 'US', style: 'Macro', tracked: true },
  { name: 'Citadel Advisors', cik: '0001423053', country: 'US', style: 'Multi-strategy', tracked: false },
  { name: 'Vanguard Group', cik: '0000102909', country: 'US', style: 'Index', tracked: false },
  { name: 'Royal Bank of Canada', cik: '0001000275', country: 'CA', style: 'Bank / asset manager', tracked: false },
];
