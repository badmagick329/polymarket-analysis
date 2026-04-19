import type { AppConfig } from "./config.ts";
import type { MarketPosition, WalletMarketAggregate, WalletScore } from "./types.ts";

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
