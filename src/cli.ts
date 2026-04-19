import { PolymarketApi } from "./api.ts";
import { aggregateWalletMarkets, scoreWallets } from "./analyzer.ts";
import { config } from "./config.ts";
import { printAnalysis, printTagCandidates } from "./output.ts";
import { Store } from "./store.ts";
import { resolveTopic, tagName } from "./topic.ts";

type CliOptions = {
  command: string | undefined;
  topic: string | undefined;
  limit: number;
};

export async function runCli(args: string[]): Promise<void> {
  const options = parseArgs(args);

  if (options.command !== "analyze" || !options.topic) {
    printUsage();
    return;
  }

  const store = new Store(config.dbPath);
  const api = new PolymarketApi(config);

  try {
    let tags = store.getTags();
    if (tags.length === 0) {
      tags = await api.fetchTags();
      store.saveTags(tags);
    }

    let topic = resolveTopic(options.topic, tags);
    if (topic.kind === "not_found") {
      const slugMatch = await api.fetchTagBySlug(options.topic.toLowerCase());
      if (slugMatch) {
        store.saveTags([slugMatch]);
        tags = [...tags, slugMatch];
        topic = { kind: "matched", tag: slugMatch };
      }
    }

    if (topic.kind === "ambiguous") {
      printTagCandidates("Ambiguous topic. Use exact tag slug or id:", topic.candidates);
      return;
    }
    if (topic.kind === "not_found") {
      printTagCandidates("No matching tag found.", topic.candidates);
      return;
    }

    let markets = store.getMarkets(topic.tag.id);
    if (markets.length === 0) {
      markets = await api.fetchResolvedMarketsForTag(topic.tag.id);
      store.saveMarkets(topic.tag.id, markets);
    }

    const allPositions = [];
    for (const market of markets) {
      let positions = store.getPositions(market.conditionId);
      if (positions.length === 0) {
        positions = await api.fetchClosedPositionsForMarket(market.conditionId);
        store.savePositions(positions);
      }
      allPositions.push(...positions);
    }

    const aggregates = aggregateWalletMarkets(allPositions);
    const walletsConsidered = new Set(aggregates.map((aggregate) => aggregate.wallet)).size;
    const scores = scoreWallets(tagName(topic.tag), aggregates, config);
    const summary = {
      tag: topic.tag,
      marketsAnalyzed: markets.length,
      walletsConsidered,
      walletsPassingFilters: scores.length,
    };

    store.saveAnalysisRun({
      tagId: topic.tag.id,
      tagLabel: tagName(topic.tag),
      marketsAnalyzed: summary.marketsAnalyzed,
      walletsConsidered: summary.walletsConsidered,
      walletsPassingFilters: summary.walletsPassingFilters,
    });

    printAnalysis(summary, scores, options.limit);
  } finally {
    store.close();
  }
}

function parseArgs(args: string[]): CliOptions {
  const command = args[0];
  const topic = args[1];
  const limitIndex = args.indexOf("--limit");
  const parsedLimit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : config.defaultResultLimit;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : config.defaultResultLimit;
  return { command, topic, limit };
}

function printUsage(): void {
  console.log("Usage: bun run index.ts analyze <topic> [--limit N]");
  console.log("Example: bun run index.ts analyze politics --limit 25");
}
