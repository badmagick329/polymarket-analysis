import { PolymarketApi } from "./api.ts";
import {
  buildWalletMarketRows,
  filterRowsClosedAfter,
  inspectWalletMarkets,
  rowsToAggregates,
  scoreWallets,
  topRowsForWallet,
} from "./analyzer.ts";
import { config } from "./config.ts";
import { printAnalysis, printInspection, printShortlist, printTagCandidates, printTopics, printWalletCandidates } from "./output.ts";
import { Store } from "./store.ts";
import { resolveTopic, tagName } from "./topic.ts";
import type { GammaMarket, GammaTag, MarketPosition } from "./types.ts";

type CliOptions = {
  command: string | undefined;
  wallet: string | undefined;
  topic: string | undefined;
  limit: number;
  show: number;
  search: string | null;
  allTopics: boolean;
  activeWithinYears: number | null;
  afterDate: Date | null;
};

export async function runCli(args: string[]): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    return;
  }

  if (!isValidCommand(options)) {
    printUsage();
    return;
  }

  const store = new Store(config.dbPath);
  const api = new PolymarketApi(config);

  try {
    if (options.command === "topics") {
      printTopics(listTopics(await loadTags(store, api, true), options.search, options.limit, options.allTopics));
      return;
    }

    const context = await loadTopicContext(options.topic!, store, api);
    if (!context) return;

    if (options.command === "inspect") {
      const wallet = resolveWallet(options.wallet!, context.positions);
      if (wallet.kind !== "matched") {
        printWalletCandidates(options.wallet!, wallet.candidates);
        return;
      }

      printInspection({
        topic: tagName(context.tag),
        wallet: wallet.wallet,
        rows: await inspectWalletRows(wallet.wallet, context.markets, context.positions, options.limit, options.afterDate, store, api),
        limit: options.limit,
        afterDate: options.afterDate,
      });
      return;
    }

    const rows = filterRowsClosedAfter(buildWalletMarketRows(context.markets, context.positions), options.afterDate);
    const aggregates = rowsToAggregates(rows);
    const walletsConsidered = new Set(rows.map((row) => row.wallet)).size;
    const scores = scoreWallets(tagName(context.tag), aggregates, config);
    const activeFilter = options.activeWithinYears !== null
      ? await filterActiveScores(scores, options.activeWithinYears, options.limit, store, api)
      : null;
    const outputScores = activeFilter?.scores ?? scores;
    const summary = {
      tag: context.tag,
      marketsAnalyzed: uniqueMarketCount(rows),
      walletsConsidered,
      walletsPassingFilters: outputScores.length,
    };

    store.saveAnalysisRun({
      tagId: context.tag.id,
      tagLabel: tagName(context.tag),
      marketsAnalyzed: summary.marketsAnalyzed,
      walletsConsidered: summary.walletsConsidered,
      walletsPassingFilters: summary.walletsPassingFilters,
    });

    if (options.command === "shortlist") {
      printShortlist({
        summary,
        entries: outputScores.slice(0, options.limit).map((score) => ({
          score,
          rows: topRowsForWallet(rows, score.wallet, options.show),
        })),
        afterDate: options.afterDate,
        activeFilter: activeFilter ?? undefined,
        show: options.show,
      });
      return;
    }

    printAnalysis(summary, outputScores, options.limit, { active: activeFilter ?? undefined, afterDate: options.afterDate });
  } finally {
    store.close();
  }
}

async function inspectWalletRows(
  wallet: string,
  markets: GammaMarket[],
  positions: MarketPosition[],
  limit: number,
  afterDate: Date | null,
  store: Store,
  api: PolymarketApi,
) {
  const rows = inspectWalletMarkets(wallet, markets, positions);
  const candidateRows = afterDate ? rows.filter((row) => row.closedAt !== null && row.closedAt >= afterDate) : rows;
  const rowsToShow = candidateRows.slice(0, limit);
  const datesByConditionId = new Map<string, { openedAt: Date | null; closedAt: Date | null }>();

  for (const row of rowsToShow) {
    let dates = store.getWalletMarketDates(wallet, row.conditionId);
    if (!dates) {
      dates = await fetchWalletMarketDates(wallet, row.conditionId, markets, api);
      store.saveWalletMarketDates(wallet, row.conditionId, dates);
    }
    datesByConditionId.set(row.conditionId, dates);
  }

  const rowsWithDates = inspectWalletMarkets(wallet, markets, positions, datesByConditionId);
  return afterDate ? rowsWithDates.filter((row) => row.closedAt !== null && row.closedAt >= afterDate) : rowsWithDates;
}

function parseArgs(args: string[]): CliOptions {
  const command = args[0];
  const wallet = command === "inspect" ? args[1] : undefined;
  const topic = command === "inspect" ? args[2] : args[1];
  const limitIndex = args.indexOf("--limit");
  const defaultLimit = command === "topics" ? config.defaultTopicsLimit : config.defaultResultLimit;
  const parsedLimit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : defaultLimit;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : defaultLimit;
  const showIndex = args.indexOf("--show");
  const parsedShow = showIndex >= 0 ? Number(args[showIndex + 1]) : config.defaultShortlistShow;
  const show = Number.isFinite(parsedShow) && parsedShow > 0 ? Math.floor(parsedShow) : config.defaultShortlistShow;
  const searchIndex = args.indexOf("--search");
  const search = searchIndex >= 0 ? args[searchIndex + 1] ?? null : null;
  const allTopics = args.includes("--all");
  const activeWithinYearsIndex = args.indexOf("--active-within-years");
  const parsedActiveWithinYears = activeWithinYearsIndex >= 0 ? Number(args[activeWithinYearsIndex + 1]) : null;
  const activeWithinYears =
    parsedActiveWithinYears !== null && Number.isInteger(parsedActiveWithinYears) && parsedActiveWithinYears >= 0
      ? parsedActiveWithinYears
      : null;
  const afterDateIndex = args.indexOf("--after");
  const afterDate = afterDateIndex >= 0 ? parseDateArg(args[afterDateIndex + 1]) : null;
  return { command, wallet, topic, limit, show, search, allTopics, activeWithinYears, afterDate };
}

function isValidCommand(options: CliOptions): boolean {
  if (options.command === "topics") return true;
  if (options.command === "analyze") return Boolean(options.topic);
  if (options.command === "shortlist") return Boolean(options.topic);
  if (options.command === "inspect") return Boolean(options.wallet && options.topic);
  return false;
}

async function loadTopicContext(
  topicInput: string,
  store: Store,
  api: PolymarketApi,
): Promise<{ tag: GammaTag; markets: GammaMarket[]; positions: MarketPosition[] } | null> {
  let tags = await loadTags(store, api);

  let topic = resolveTopic(topicInput, tags);
  if (topic.kind === "not_found") {
    const slugMatch = await api.fetchTagBySlug(topicInput.toLowerCase());
    if (slugMatch) {
      store.saveTags([slugMatch]);
      topic = { kind: "matched", tag: slugMatch };
    }
  }

  if (topic.kind === "ambiguous") {
    printTagCandidates("Ambiguous topic. Use exact tag slug or id:", topic.candidates);
    return null;
  }
  if (topic.kind === "not_found") {
    printTagCandidates("No matching tag found.", topic.candidates);
    return null;
  }

  let markets = store.getMarkets(topic.tag.id);
  if (markets.length === 0) {
    markets = await api.fetchResolvedMarketsForTag(topic.tag.id);
    store.saveMarkets(topic.tag.id, markets);
  }

  const positions: MarketPosition[] = [];
  for (const market of markets) {
    let marketPositions = store.getPositions(market.conditionId);
    if (marketPositions.length === 0) {
      marketPositions = await api.fetchClosedPositionsForMarket(market.conditionId);
      store.savePositions(marketPositions);
    }
    positions.push(...marketPositions);
  }

  return { tag: topic.tag, markets, positions };
}

async function loadTags(store: Store, api: PolymarketApi, refresh = false): Promise<GammaTag[]> {
  let tags = store.getTags();
  if (refresh || tags.length === 0) {
    tags = await api.fetchTags();
    store.saveTags(tags);
  }
  return tags;
}

export function filterTopics(tags: GammaTag[], search: string | null): GammaTag[] {
  const query = search?.trim().toLowerCase();
  if (!query) return tags;
  return tags.filter((tag) => (tag.label ?? "").toLowerCase().includes(query) || (tag.slug ?? "").toLowerCase().includes(query));
}

export function listTopics(tags: GammaTag[], search: string | null, limit: number, allTopics = false): GammaTag[] {
  if (search || allTopics) return filterTopics(tags, search).slice(0, limit);

  const bySlug = new Map(tags.map((tag) => [tag.slug, tag]));
  return commonTopicSlugs.map((slug) => bySlug.get(slug)).filter((tag) => tag !== undefined);
}

async function filterActiveScores(
  scores: ReturnType<typeof scoreWallets>,
  activeWithinYears: number,
  limit: number,
  store: Store,
  api: PolymarketApi,
): Promise<{ scores: ReturnType<typeof scoreWallets>; withinYears: number; cutoffYear: number; checkedWallets: number }> {
  const cutoffYear = new Date().getFullYear() - activeWithinYears;
  const filteredScores: ReturnType<typeof scoreWallets> = [];
  let checkedWallets = 0;

  for (const score of scores) {
    if (filteredScores.length >= limit || checkedWallets >= config.maxActivityChecks) break;

    let latestActivityYear = store.getLatestActivityYear(score.wallet);
    if (latestActivityYear === undefined) {
      latestActivityYear = await api.fetchLatestActivityYear(score.wallet);
      store.saveLatestActivityYear(score.wallet, latestActivityYear);
    }

    checkedWallets += 1;
    if (latestActivityYear !== null && latestActivityYear >= cutoffYear) {
      filteredScores.push({ ...score, rank: filteredScores.length + 1, latestActivityYear });
    }
  }

  return { scores: filteredScores, withinYears: activeWithinYears, cutoffYear, checkedWallets };
}

function resolveWallet(input: string, positions: MarketPosition[]): { kind: "matched"; wallet: string } | { kind: "ambiguous" | "not_found"; candidates: string[] } {
  const normalized = input.toLowerCase();
  const wallets = [...new Set(positions.map((position) => position.proxyWallet))];

  const exact = wallets.find((wallet) => wallet.toLowerCase() === normalized);
  if (exact) return { kind: "matched", wallet: exact };

  const shortMatch = normalized.match(/^(0x[a-f0-9]+)\.\.\.([a-f0-9]+)$/);
  if (shortMatch) {
    const [, prefix, suffix] = shortMatch;
    const candidates = wallets.filter((wallet) => wallet.toLowerCase().startsWith(prefix!) && wallet.toLowerCase().endsWith(suffix!));
    if (candidates.length === 1) return { kind: "matched", wallet: candidates[0]! };
    return { kind: candidates.length === 0 ? "not_found" : "ambiguous", candidates };
  }

  return { kind: "not_found", candidates: [] };
}

async function fetchWalletMarketDates(
  wallet: string,
  conditionId: string,
  markets: GammaMarket[],
  api: PolymarketApi,
) {
  const market = markets.find((candidate) => candidate.conditionId === conditionId);
  const [trades, closedPositions] = await Promise.all([
    api.fetchTradesForWalletMarket(wallet, conditionId),
    api.fetchClosedPositionsForWalletMarket(wallet, conditionId),
  ]);

  const openedAt = minTimestampDate(trades.map((trade) => trade.timestamp));
  const closedAt =
    maxTimestampDate(closedPositions.map((position) => position.timestamp).filter((timestamp) => timestamp !== undefined)) ??
    parseDate(market?.closedTime ?? market?.endDate ?? null);

  return { openedAt, closedAt };
}

function minTimestampDate(timestamps: number[]): Date | null {
  const valid = timestamps.filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
  if (valid.length === 0) return null;
  return new Date(Math.min(...valid) * 1000);
}

function maxTimestampDate(timestamps: number[]): Date | null {
  const valid = timestamps.filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid) * 1000);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseDateArg(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("--after must use YYYY-MM-DD");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("--after must use a valid YYYY-MM-DD date");
  }
  return date;
}

function uniqueMarketCount(rows: { marketConditionId: string }[]): number {
  return new Set(rows.map((row) => row.marketConditionId)).size;
}

function printUsage(): void {
  console.log("Usage: bun run index.ts topics [--all] [--limit N] [--search TEXT]");
  console.log("Usage: bun run index.ts analyze <topic> [--limit N] [--after YYYY-MM-DD] [--active-within-years N]");
  console.log("Usage: bun run index.ts shortlist <topic> [--limit N] [--show N] [--after YYYY-MM-DD] [--active-within-years N]");
  console.log("Usage: bun run index.ts inspect <wallet> <topic> [--limit N] [--after YYYY-MM-DD]");
  console.log("Example: bun run index.ts topics");
  console.log("Example: bun run index.ts topics --all --limit 100");
  console.log("Example: bun run index.ts topics --search election --limit 25");
  console.log("Example: bun run index.ts analyze politics --limit 25 --after 2023-01-01 --active-within-years 2");
  console.log("Example: bun run index.ts shortlist politics --limit 10 --show 3 --after 2023-01-01 --active-within-years 2");
  console.log("Example: bun run index.ts inspect 0x8c2f...64fa politics --limit 10 --after 2023-01-01");
}

const commonTopicSlugs = [
  "politics",
  "crypto",
  "sports",
  "business",
  "economy",
  "elections",
  "trump",
  "artificial-intelligence",
  "fed",
  "nfl",
  "nba",
  "mlb",
  "soccer",
  "ufc",
  "culture",
  "movies",
  "music",
  "tech",
  "covid",
  "weather",
];
