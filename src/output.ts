import type { AnalysisSummary, GammaTag, ShortlistEntry, WalletMarketInspection, WalletScore } from "./types.ts";
import { tagName } from "./topic.ts";

export function printTagCandidates(title: string, candidates: GammaTag[]): void {
  console.log(title);
  if (candidates.length === 0) return;

  for (const tag of candidates) {
    console.log(`- ${tagName(tag)} (${tag.slug ?? "no-slug"}, id ${tag.id})`);
  }
}

export function printTopics(tags: GammaTag[]): void {
  if (tags.length === 0) {
    console.log("No topics found.");
    return;
  }

  console.table(
    tags.map((tag) => ({
      label: tag.label ?? "",
      slug: tag.slug ?? "",
      id: tag.id,
    })),
  );
}

export function printAnalysis(
  summary: AnalysisSummary,
  scores: WalletScore[],
  limit: number,
  filters?: { active?: { withinYears: number; cutoffYear: number; checkedWallets: number }; afterDate?: Date | null },
): void {
  console.log(`Topic: ${tagName(summary.tag)} (${summary.tag.slug ?? "no-slug"}, id ${summary.tag.id})`);
  if (filters?.afterDate) {
    console.log(`After: ${formatDate(filters.afterDate)}`);
  }
  console.log(
    `Markets analyzed: ${summary.marketsAnalyzed} | Wallets considered: ${summary.walletsConsidered} | Passing filters: ${summary.walletsPassingFilters}`,
  );
  if (filters?.active) {
    console.log(
      `Active filter: latest activity year >= ${filters.active.cutoffYear} (${filters.active.withinYears}y) | Wallets checked: ${filters.active.checkedWallets}`,
    );
  }

  if (scores.length === 0) {
    console.log(filters?.afterDate || filters?.active ? "No wallets matched filters." : "No wallets passed filters. Lower thresholds in src/config.ts or analyze more markets.");
    return;
  }

  const rows = scores.slice(0, limit).map((score) => ({
    rank: score.rank,
    wallet: shortenWallet(score.wallet),
    edgeScore: score.edgeScore.toFixed(2),
    realizedPnl: formatUsd(score.realizedPnl),
    tradingRoi: formatPercent(score.roi),
    positiveRate: formatPercent(score.positiveMarketRate),
    markets: score.resolvedMarkets,
    positions: score.resolvedPositions,
    activeYear: score.latestActivityYear ?? "unknown",
    totalBought: formatUsd(score.totalBought),
  }));

  console.table(rows);
}

export function printShortlist(input: {
  summary: AnalysisSummary;
  entries: ShortlistEntry[];
  afterDate: Date | null;
  activeFilter?: { withinYears: number; cutoffYear: number; checkedWallets: number };
  show: number;
}): void {
  console.log(`Topic: ${tagName(input.summary.tag)} (${input.summary.tag.slug ?? "no-slug"}, id ${input.summary.tag.id})`);
  if (input.afterDate) {
    console.log(`After: ${formatDate(input.afterDate)}`);
  }
  console.log(
    `Markets analyzed: ${input.summary.marketsAnalyzed} | Wallets considered: ${input.summary.walletsConsidered} | Passing filters: ${input.summary.walletsPassingFilters}`,
  );
  if (input.activeFilter) {
    console.log(
      `Active filter: latest activity year >= ${input.activeFilter.cutoffYear} (${input.activeFilter.withinYears}y) | Wallets checked: ${input.activeFilter.checkedWallets}`,
    );
  }

  if (input.entries.length === 0) {
    console.log("No wallets matched filters.");
    return;
  }

  for (const entry of input.entries) {
    const score = entry.score;
    console.log("");
    console.log(
      `#${score.rank} ${shortenWallet(score.wallet)} | edgeScore ${score.edgeScore.toFixed(2)} | PnL ${formatUsd(score.realizedPnl)} | tradingRoi ${formatPercent(score.roi)} | markets ${score.resolvedMarkets} | active ${score.latestActivityYear ?? "unknown"}`,
    );

    console.table(
      entry.rows.slice(0, input.show).map((row) => ({
        realizedPnl: formatUsd(row.realizedPnl),
        tradingRoi: formatPercent(row.totalBought === 0 ? 0 : row.realizedPnl / row.totalBought),
        closed: formatDate(row.closedAt),
        side: row.side,
        finalOutcome: row.finalOutcome ?? "unknown",
        correctAtResolution: row.correctAtResolution,
        question: truncate(row.question, 88),
      })),
    );
  }
}

export function printInspection(input: {
  topic: string;
  wallet: string;
  rows: WalletMarketInspection[];
  limit: number;
  afterDate?: Date | null;
}): void {
  const realizedPnl = input.rows.reduce((total, row) => total + row.realizedPnl, 0);
  const totalBought = input.rows.reduce((total, row) => total + row.totalBought, 0);
  const positions = input.rows.reduce((total, row) => total + row.positions, 0);
  const positiveMarkets = input.rows.filter((row) => row.realizedPnl > 0).length;
  const roi = totalBought === 0 ? 0 : realizedPnl / totalBought;

  console.log(`Wallet: ${input.wallet}`);
  console.log(`Topic: ${input.topic}`);
  if (input.afterDate) {
    console.log(`After: ${formatDate(input.afterDate)}`);
  }
  console.log(
    `Markets: ${input.rows.length} | Positions: ${positions} | Positive markets: ${positiveMarkets} | Realized PnL: ${formatUsd(realizedPnl)} | tradingRoi: ${formatPercent(roi)}`,
  );

  if (input.rows.length === 0) {
    console.log("No cached/fetched positions found for this wallet in this topic.");
    return;
  }

  console.table(
    input.rows.slice(0, input.limit).map((row, index) => ({
      rank: index + 1,
      realizedPnl: formatUsd(row.realizedPnl),
      tradingRoi: formatPercent(row.roi),
      totalBought: formatUsd(row.totalBought),
      positionOpened: formatDate(row.openedAt),
      marketOpened: formatDate(row.marketOpenedAt),
      closed: formatDate(row.closedAt),
      positions: row.positions,
      side: row.side,
      finalOutcome: row.finalOutcome ?? "unknown",
      correctAtResolution: row.correctAtResolution,
      question: truncate(row.question, 72),
    })),
  );
}

export function printWalletCandidates(input: string, candidates: string[]): void {
  if (candidates.length === 0) {
    console.log(`No wallet matched ${input}. Use full address or run analyze for this topic first.`);
    return;
  }

  console.log(`Ambiguous wallet ${input}. Use full address:`);
  for (const wallet of candidates) {
    console.log(`- ${wallet}`);
  }
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

function formatDate(value: Date | null): string {
  if (!value) return "unknown";
  return value.toISOString().slice(0, 10);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}
