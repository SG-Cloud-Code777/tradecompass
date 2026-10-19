import type { SectorId } from './types.js';

/**
 * Macro sensitivities per sector. A coefficient multiplies the direction of the macro series
 * (+1 up, 0 flat, -1 down). e.g. gold: rates -1 means "rising rates are a headwind for gold".
 */
export interface SectorProfile {
  id: SectorId;
  name: string;
  emoji: string;
  sensitivities: { rates?: number; usd?: number; inflation?: number; commodity?: number };
  /** Yahoo-style symbol of the driving commodity/proxy, if any. */
  commoditySymbol?: string;
  commodityName?: string;
  drivers: string[];
  whatMovesIt: string;
  invalidation: string;
  thesisBreakers: string[];
}

export const SECTORS: Record<SectorId, SectorProfile> = {
  gold: {
    id: 'gold',
    name: 'Gold',
    emoji: '🥇',
    sensitivities: { rates: -1, usd: -1, inflation: 0.5, commodity: 1.5 },
    commoditySymbol: 'GC=F',
    commodityName: 'Gold futures',
    drivers: ['Real interest rates (↓ = good)', 'US dollar (↓ = good)', 'Gold spot price', 'Central-bank buying', 'Geopolitical stress'],
    whatMovesIt:
      'Gold pays no interest, so it competes with bonds: when real (inflation-adjusted) yields fall, gold usually rises. A weaker US dollar makes gold cheaper for the rest of the world. Miners are leveraged to the gold price — their costs are roughly fixed, so a 10% move in gold can mean a 20–30% move in miner profits, both ways.',
    invalidation: 'A sustained US-dollar rally together with rising real yields, or gold breaking below its 200-day average.',
    thesisBreakers: ['All-in sustaining cost (AISC) rising faster than gold', 'Mine-plan downgrade or permitting setback'],
  },
  silver: {
    id: 'silver',
    name: 'Silver',
    emoji: '🥈',
    sensitivities: { rates: -0.7, usd: -1, inflation: 0.5, commodity: 1.5 },
    commoditySymbol: 'SI=F',
    commodityName: 'Silver futures',
    drivers: ['Gold price (silver follows, with more volatility)', 'Industrial demand (solar panels, electronics)', 'US dollar', 'Real rates'],
    whatMovesIt:
      'Silver is half precious metal, half industrial metal. It tends to follow gold but swings harder, and solar and electronics demand adds an economic-cycle component. Silver miners are smaller and more volatile than gold miners.',
    invalidation: 'Silver falling below its 200-day average while the gold/silver ratio widens (silver losing to gold).',
    thesisBreakers: ['Rising production costs', 'Weak industrial demand data'],
  },
  copper: {
    id: 'copper',
    name: 'Copper',
    emoji: '🟠',
    sensitivities: { usd: -0.7, rates: -0.3, commodity: 1.5 },
    commoditySymbol: 'HG=F',
    commodityName: 'Copper futures',
    drivers: ['China construction & manufacturing demand', 'Electrification (EVs, grid)', 'Mine supply disruptions', 'US dollar'],
    whatMovesIt:
      '"Dr. Copper" is a read on the global economy. China uses about half the world\'s copper, so Chinese property and factory data matter a lot. Long-term, EVs and grid build-out add demand while new mines take 10+ years to open.',
    invalidation: 'Weak China PMI readings with copper breaking below its 200-day average.',
    thesisBreakers: ['Mine shutdown or royalty/tax change in a key jurisdiction', 'Copper inventories building sharply'],
  },
  oil_gas: {
    id: 'oil_gas',
    name: 'Oil & Gas',
    emoji: '🛢️',
    sensitivities: { commodity: 1.5, usd: -0.3, inflation: 0.5 },
    commoditySymbol: 'CL=F',
    commodityName: 'WTI crude futures',
    drivers: ['OPEC+ production decisions', 'Weekly US inventories (EIA)', 'Global demand / recession risk', 'Refining margins', 'WCS–WTI spread (Canadian heavy oil)'],
    whatMovesIt:
      'Producer profits swing with the oil price. OPEC+ quotas and weekly US inventory reports move crude short-term; recessions cut demand. Canadian producers also depend on the discount on Western Canadian Select heavy oil and on pipeline capacity.',
    invalidation: 'Crude falling below its 200-day average on rising inventories or an OPEC+ supply increase.',
    thesisBreakers: ['Dividend or buyback cut', 'Major production outage or cost overrun'],
  },
  semis: {
    id: 'semis',
    name: 'Semiconductors',
    emoji: '💾',
    sensitivities: { rates: -1 },
    drivers: ['AI data-centre capex (hyperscaler spending)', 'PC/phone upgrade cycles', 'Inventory cycle', 'Export controls (US–China)', 'Interest rates (growth valuations)'],
    whatMovesIt:
      'Chips are cyclical: when customers over-order, an inventory glut follows. Today the AI capex cycle — big cloud companies buying GPUs and networking — dominates. Valuations are high, so rising rates and any hint of slower AI spending can hit the group hard.',
    invalidation: 'Hyperscalers guiding capex lower, or the sector ETF losing its 200-day average.',
    thesisBreakers: ['Guidance cut / inventory build at customers', 'New export restrictions on a key market'],
  },
  robotics_ai: {
    id: 'robotics_ai',
    name: 'Robotics & AI',
    emoji: '🤖',
    sensitivities: { rates: -1 },
    drivers: ['Enterprise AI adoption & cloud revenue', 'Industrial automation orders', 'Interest rates', 'Labour costs'],
    whatMovesIt:
      'Software/AI names trade on future growth, so they are sensitive to interest rates and to evidence that AI spending turns into revenue. Industrial robotics follows factory orders and the manufacturing cycle.',
    invalidation: 'Revenue growth decelerating while valuations stay high, or rates rising sharply.',
    thesisBreakers: ['Customer churn or slowing bookings', 'Margins compressing from AI compute costs'],
  },
  mining: {
    id: 'mining',
    name: 'Mining (Uranium · Lithium · General)',
    emoji: '⛏️',
    sensitivities: { usd: -0.7, rates: -0.3 },
    drivers: ['Uranium: reactor restarts/new builds, long-term contracts', 'Lithium: EV demand vs. supply glut', 'Diversified: China demand, US dollar', 'Permitting & jurisdiction risk'],
    whatMovesIt:
      'Each metal has its own cycle. Uranium is driven by utilities signing long-term contracts and by nuclear policy. Lithium boomed then crashed on oversupply. Junior miners (especially TSXV listings) are exploration bets: many never reach production.',
    invalidation: 'Spot price for the relevant metal breaking down, or financing dilution at a junior.',
    thesisBreakers: ['Equity raise at a discount (dilution)', 'Failed feasibility study or permit'],
  },
  food_ag: {
    id: 'food_ag',
    name: 'Food & Agriculture',
    emoji: '🌾',
    sensitivities: { commodity: 1, inflation: 0.5 },
    commoditySymbol: 'DBA',
    commodityName: 'Agriculture basket (DBA)',
    drivers: ['Crop prices (corn, wheat, soy)', 'Fertilizer prices (potash, nitrogen)', 'Weather & harvests', 'Consumer staples pricing power'],
    whatMovesIt:
      'Fertilizer producers like Nutrien follow crop and fertilizer prices. Farm-equipment makers follow farm income. Grocers and food processors are defensive — steady demand, thin margins.',
    invalidation: 'Crop prices falling sharply (lower farm income) or input costs squeezing margins.',
    thesisBreakers: ['Margin squeeze', 'Big harvest-driven price collapse'],
  },
  reits: {
    id: 'reits',
    name: 'REITs',
    emoji: '🏢',
    sensitivities: { rates: -1.5, inflation: -0.3 },
    drivers: ['Interest rates (↓ = good)', 'Occupancy & rent growth', 'Property type (industrial, retail, office, residential)', 'Refinancing costs'],
    whatMovesIt:
      'REITs borrow to own buildings and pay out most of their cash flow, so they behave a bit like bonds: rising rates raise their costs and make their yields less attractive. Judge them on FFO (funds from operations), not EPS.',
    invalidation: 'Bond yields rising sharply, or occupancy falling.',
    thesisBreakers: ['Distribution cut', 'AFFO payout ratio above 100%', 'Large refinancing at much higher rates'],
  },
  etfs: {
    id: 'etfs',
    name: 'ETFs',
    emoji: '🧺',
    sensitivities: { rates: -0.5 },
    drivers: ['Broad market earnings', 'Interest rates', 'Fees (MER)', 'Currency (hedged vs unhedged)'],
    whatMovesIt:
      'Broad index ETFs move with overall corporate earnings and with interest rates. For Canadians, a CAD-hedged ETF removes the USD/CAD swing; an unhedged one adds it.',
    invalidation: 'Index losing its 200-day average with breadth deteriorating.',
    thesisBreakers: ['Fee increase or tracking error', 'Change in the index methodology'],
  },
  dividend: {
    id: 'dividend',
    name: 'Dividend stocks',
    emoji: '💵',
    sensitivities: { rates: -1 },
    drivers: ['Interest rates (bond competition)', 'Payout ratio & free cash flow coverage', 'Dividend growth history', 'Regulated earnings (utilities, telcos)'],
    whatMovesIt:
      'Dividend stocks compete with bonds and GICs, so rising rates usually weigh on them. Safety comes from free cash flow covering the dividend with room to spare. A very high yield is often a warning that the market expects a cut.',
    invalidation: 'Payout ratio climbing above 100% or a dividend freeze/cut.',
    thesisBreakers: ['Dividend cut', 'Debt rising to fund the payout'],
  },
};

export const SECTOR_ORDER: SectorId[] = [
  'gold',
  'silver',
  'copper',
  'oil_gas',
  'semis',
  'robotics_ai',
  'mining',
  'food_ag',
  'reits',
  'etfs',
  'dividend',
];
