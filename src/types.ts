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
  startDate?: string | null;
  createdAt?: string | null;
  endDate?: string | null;
  closedTime?: string | null;
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

export type WalletTrade = {
  proxyWallet: string;
  conditionId: string;
  timestamp: number;
  side: string;
};

export type WalletActivity = {
  proxyWallet: string;
  timestamp: number;
};

export type ClosedPosition = {
  proxyWallet: string;
  conditionId: string;
  timestamp?: number;
  endDate?: string | null;
  realizedPnl: number;
  totalBought: number;
  outcome: string;
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

export type WalletMarketRow = WalletMarketAggregate & {
  question: string;
  marketSlug: string;
  side: string;
  finalOutcome: string | null;
  correctAtResolution: "yes" | "no" | "unknown";
  marketOpenedAt: Date | null;
  closedAt: Date | null;
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
  latestActivityYear?: number | null;
};

export type WalletMarketInspection = {
  wallet: string;
  question: string;
  marketSlug: string;
  conditionId: string;
  realizedPnl: number;
  totalBought: number;
  roi: number;
  positions: number;
  side: string;
  finalOutcome: string | null;
  correctAtResolution: "yes" | "no" | "unknown";
  openedAt: Date | null;
  marketOpenedAt: Date | null;
  closedAt: Date | null;
};

export type ShortlistEntry = {
  score: WalletScore;
  rows: WalletMarketRow[];
};

export type AnalysisSummary = {
  tag: GammaTag;
  marketsAnalyzed: number;
  walletsConsidered: number;
  walletsPassingFilters: number;
};
