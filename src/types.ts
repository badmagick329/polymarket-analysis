export type GammaTag = {
  id: string;
  label: string | null;
  slug: string | null;
};

export type GammaMarket = {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  closed: boolean;
  umaResolutionStatus?: string | null;
  volumeNum?: number | null;
  outcomes?: string | null;
  outcomePrices?: string | null;
};

export type MarketPosition = {
  proxyWallet: string;
  name: string | null;
  asset: string;
  conditionId: string;
  avgPrice: number;
  size: number;
  currPrice: number;
  currentValue: number;
  cashPnl: number;
  totalBought: number;
  realizedPnl: number;
  totalPnl: number;
  outcome: string;
  outcomeIndex: number;
};

export type TopicResolution =
  | { kind: "matched"; tag: GammaTag }
  | { kind: "ambiguous"; candidates: GammaTag[] }
  | { kind: "not_found"; candidates: GammaTag[] };

export type WalletMarketAggregate = {
  wallet: string;
  marketConditionId: string;
  realizedPnl: number;
  totalBought: number;
  positions: number;
};

export type WalletScore = {
  rank: number;
  wallet: string;
  topic: string;
  edgeScore: number;
  realizedPnl: number;
  roi: number;
  positiveMarketRate: number;
  resolvedMarkets: number;
  resolvedPositions: number;
  totalBought: number;
};

export type AnalysisSummary = {
  tag: GammaTag;
  marketsAnalyzed: number;
  walletsConsidered: number;
  walletsPassingFilters: number;
};
