import type { AnalysisSummary, GammaTag, WalletScore } from "./types.ts";
import { tagName } from "./topic.ts";

export function printTagCandidates(title: string, candidates: GammaTag[]): void {
  console.log(title);
  if (candidates.length === 0) return;

  for (const tag of candidates) {
    console.log(`- ${tagName(tag)} (${tag.slug ?? "no-slug"}, id ${tag.id})`);
  }
}

export function printAnalysis(summary: AnalysisSummary, scores: WalletScore[], limit: number): void {
  console.log(`Topic: ${tagName(summary.tag)} (${summary.tag.slug ?? "no-slug"}, id ${summary.tag.id})`);
  console.log(
    `Markets analyzed: ${summary.marketsAnalyzed} | Wallets considered: ${summary.walletsConsidered} | Passing filters: ${summary.walletsPassingFilters}`,
  );

  if (scores.length === 0) {
    console.log("No wallets passed filters. Lower thresholds in src/config.ts or analyze more markets.");
    return;
  }

  const rows = scores.slice(0, limit).map((score) => ({
    rank: score.rank,
    wallet: shortenWallet(score.wallet),
    edgeScore: score.edgeScore.toFixed(2),
    realizedPnl: formatUsd(score.realizedPnl),
    roi: formatPercent(score.roi),
    positiveRate: formatPercent(score.positiveMarketRate),
    markets: score.resolvedMarkets,
    positions: score.resolvedPositions,
    totalBought: formatUsd(score.totalBought),
  }));

  console.table(rows);
}

function shortenWallet(wallet: string): string {
  if (wallet.length <= 14) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
