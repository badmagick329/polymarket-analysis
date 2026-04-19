import type { AppConfig } from "./config.ts";
import type {
  GammaMarket,
  MarketPosition,
  WalletMarketAggregate,
  WalletMarketInspection,
  WalletMarketRow,
  WalletScore,
} from "./types.ts";

export function aggregateWalletMarkets(positions: MarketPosition[]): WalletMarketAggregate[] {
  const byWalletMarket = new Map<string, WalletMarketAggregate>();

  for (const position of positions) {
    const key = `${position.proxyWallet}:${position.conditionId}`;
    const aggregate = byWalletMarket.get(key) ?? {
      wallet: position.proxyWallet,
      marketConditionId: position.conditionId,
      realizedPnl: 0,
      totalBought: 0,
      positions: 0,
    };

    aggregate.realizedPnl += Number(position.realizedPnl) || 0;
    aggregate.totalBought += Number(position.totalBought) || 0;
    aggregate.positions += 1;
    byWalletMarket.set(key, aggregate);
  }

  return [...byWalletMarket.values()];
}

export function scoreWallets(topic: string, aggregates: WalletMarketAggregate[], appConfig: AppConfig): WalletScore[] {
  const byWallet = new Map<string, WalletMarketAggregate[]>();

  for (const aggregate of aggregates) {
    const walletAggregates = byWallet.get(aggregate.wallet) ?? [];
    walletAggregates.push(aggregate);
    byWallet.set(aggregate.wallet, walletAggregates);
  }

  const scores: Omit<WalletScore, "rank">[] = [];

  for (const [wallet, walletAggregates] of byWallet) {
    const realizedPnl = sum(walletAggregates.map((aggregate) => aggregate.realizedPnl));
    const totalBought = sum(walletAggregates.map((aggregate) => aggregate.totalBought));
    const resolvedPositions = sum(walletAggregates.map((aggregate) => aggregate.positions));
    const resolvedMarkets = walletAggregates.length;
    const positiveMarkets = walletAggregates.filter((aggregate) => aggregate.realizedPnl > 0).length;
    const positiveMarketRate = resolvedMarkets === 0 ? 0 : positiveMarkets / resolvedMarkets;
    const roi = totalBought === 0 ? 0 : realizedPnl / totalBought;

    if (
      resolvedMarkets < appConfig.minResolvedMarkets ||
      resolvedPositions < appConfig.minResolvedPositions ||
      totalBought < appConfig.minTotalBought ||
      roi < appConfig.minRoi ||
      positiveMarketRate < appConfig.minPositiveMarketRate
    ) {
      continue;
    }

    scores.push({
      wallet,
      topic,
      edgeScore: calculateEdgeScore({ realizedPnl, roi, positiveMarketRate, resolvedMarkets, totalBought }),
      realizedPnl,
      roi,
      positiveMarketRate,
      resolvedMarkets,
      resolvedPositions,
      totalBought,
    });
  }

  return scores
    .sort((a, b) => b.edgeScore - a.edgeScore || b.realizedPnl - a.realizedPnl)
    .map((score, index) => ({ ...score, rank: index + 1 }));
}

export function buildWalletMarketRows(markets: GammaMarket[], positions: MarketPosition[]): WalletMarketRow[] {
  const marketByConditionId = new Map(markets.map((market) => [market.conditionId, market]));
  const positionsByWalletMarket = new Map<string, MarketPosition[]>();

  for (const position of positions) {
    const key = `${position.proxyWallet}:${position.conditionId}`;
    const current = positionsByWalletMarket.get(key) ?? [];
    current.push(position);
    positionsByWalletMarket.set(key, current);
  }

  return aggregateWalletMarkets(positions).map((aggregate) => {
    const market = marketByConditionId.get(aggregate.marketConditionId);
    const marketPositions = positionsByWalletMarket.get(`${aggregate.wallet}:${aggregate.marketConditionId}`) ?? [];
    return {
      ...aggregate,
      question: market?.question ?? aggregate.marketConditionId,
      marketSlug: market?.slug ?? "",
      outcomes: [...new Set(marketPositions.map((position) => position.outcome))].join(", "),
      marketOpenedAt: marketOpenedAt(market),
      closedAt: marketClosedAt(market),
    };
  });
}

export function filterRowsClosedAfter(rows: WalletMarketRow[], afterDate: Date | null): WalletMarketRow[] {
  if (!afterDate) return rows;
  return rows.filter((row) => row.closedAt !== null && row.closedAt >= afterDate);
}

export function rowsToAggregates(rows: WalletMarketRow[]): WalletMarketAggregate[] {
  return rows.map((row) => ({
    wallet: row.wallet,
    marketConditionId: row.marketConditionId,
    realizedPnl: row.realizedPnl,
    totalBought: row.totalBought,
    positions: row.positions,
  }));
}

export function topRowsForWallet(rows: WalletMarketRow[], wallet: string, limit: number): WalletMarketRow[] {
  return rows
    .filter((row) => row.wallet.toLowerCase() === wallet.toLowerCase())
    .sort((a, b) => b.realizedPnl - a.realizedPnl)
    .slice(0, limit);
}

export function inspectWalletMarkets(
  wallet: string,
  markets: GammaMarket[],
  positions: MarketPosition[],
  datesByConditionId: Map<string, { openedAt: Date | null; closedAt: Date | null }> = new Map(),
): WalletMarketInspection[] {
  const marketByConditionId = new Map(markets.map((market) => [market.conditionId, market]));
  const walletPositions = positions.filter((position) => position.proxyWallet.toLowerCase() === wallet.toLowerCase());
  const aggregates = aggregateWalletMarkets(walletPositions);

  return aggregates
    .map((aggregate) => {
      const market = marketByConditionId.get(aggregate.marketConditionId);
      const marketPositions = walletPositions.filter((position) => position.conditionId === aggregate.marketConditionId);
      return {
        wallet: aggregate.wallet,
        question: market?.question ?? aggregate.marketConditionId,
        marketSlug: market?.slug ?? "",
        conditionId: aggregate.marketConditionId,
        realizedPnl: aggregate.realizedPnl,
        totalBought: aggregate.totalBought,
        roi: aggregate.totalBought === 0 ? 0 : aggregate.realizedPnl / aggregate.totalBought,
        positions: aggregate.positions,
        outcomes: [...new Set(marketPositions.map((position) => position.outcome))].join(", "),
        openedAt: datesByConditionId.get(aggregate.marketConditionId)?.openedAt ?? null,
        marketOpenedAt: marketOpenedAt(market),
        closedAt: datesByConditionId.get(aggregate.marketConditionId)?.closedAt ?? marketClosedAt(market),
      };
    })
    .sort((a, b) => b.realizedPnl - a.realizedPnl);
}

function marketOpenedAt(market: GammaMarket | undefined): Date | null {
  const value = market?.startDate ?? market?.createdAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function marketClosedAt(market: GammaMarket | undefined): Date | null {
  const value = market?.closedTime ?? market?.endDate;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateEdgeScore(input: {
  realizedPnl: number;
  roi: number;
  positiveMarketRate: number;
  resolvedMarkets: number;
  totalBought: number;
}): number {
  const roiScore = clamp(input.roi, 0, 1) * 30;
  const positiveRateScore = input.positiveMarketRate * 40;
  const profitScore = Math.log10(Math.max(input.realizedPnl, 0) + 1) * 10;
  const marketScore = Math.log10(input.resolvedMarkets + 1) * 10;
  const activityScore = Math.log10(input.totalBought + 1) * 5;
  return round2(roiScore + positiveRateScore + profitScore + marketScore + activityScore);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
