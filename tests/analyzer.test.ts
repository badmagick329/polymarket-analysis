import { describe, expect, test } from "bun:test";
import {
  aggregateWalletMarkets,
  buildWalletMarketRows,
  correctAtResolution,
  filterRowsClosedAfter,
  inferFinalOutcome,
  inspectWalletMarkets,
  rowsToAggregates,
  scoreWallets,
  topRowsForWallet,
} from "../src/analyzer.ts";
import { parseDateArg } from "../src/cli.ts";
import { config } from "../src/config.ts";
import type { MarketPosition } from "../src/types.ts";

describe("aggregateWalletMarkets", () => {
  test("collapses multiple outcome positions into one wallet-market result", () => {
    const aggregates = aggregateWalletMarkets([
      position({ wallet: "0xabc", conditionId: "0xmarket", asset: "yes", realizedPnl: 20, totalBought: 100 }),
      position({ wallet: "0xabc", conditionId: "0xmarket", asset: "no", realizedPnl: -5, totalBought: 50, outcomeIndex: 1 }),
    ]);

    expect(aggregates).toEqual([
      {
        wallet: "0xabc",
        marketConditionId: "0xmarket",
        realizedPnl: 15,
        totalBought: 150,
        positions: 2,
      },
    ]);
  });
});

describe("final outcome inference", () => {
  test("infers final outcome from resolved outcome prices", () => {
    expect(inferFinalOutcome(market({ conditionId: "m1", outcomes: ["Yes", "No"], outcomePrices: ["0", "1"] }))).toBe("No");
  });

  test("returns unknown when prices are invalid or ambiguous", () => {
    expect(inferFinalOutcome(market({ conditionId: "bad", outcomes: ["Yes", "No"], outcomePrices: ["0.5", "0.5"] }))).toBeNull();
    expect(inferFinalOutcome(market({ conditionId: "invalid", outcomesRaw: "not-json", outcomePrices: ["1", "0"] }))).toBeNull();
  });

  test("correctAtResolution distinguishes yes no and unknown", () => {
    expect(correctAtResolution(["No"], "No")).toBe("yes");
    expect(correctAtResolution(["Yes"], "No")).toBe("no");
    expect(correctAtResolution(["Yes", "No"], "No")).toBe("unknown");
    expect(correctAtResolution(["No"], null)).toBe("unknown");
  });
});

describe("scoreWallets", () => {
  test("filters tiny samples and ranks balanced repeatable winner first", () => {
    const appConfig = { ...config, minResolvedMarkets: 2, minResolvedPositions: 2, minTotalBought: 100 };
    const scores = scoreWallets(
      "Politics",
      [
        { wallet: "repeat", marketConditionId: "m1", realizedPnl: 40, totalBought: 100, positions: 1 },
        { wallet: "repeat", marketConditionId: "m2", realizedPnl: 35, totalBought: 100, positions: 1 },
        { wallet: "lucky", marketConditionId: "m1", realizedPnl: 500, totalBought: 10, positions: 1 },
      ],
      appConfig,
    );

    expect(scores).toHaveLength(1);
    expect(scores[0]?.wallet).toBe("repeat");
    expect(scores[0]?.rank).toBe(1);
  });
});

describe("inspectWalletMarkets", () => {
  test("returns wallet market rows sorted by realized PnL", () => {
    const rows = inspectWalletMarkets(
      "0xabc",
      [
        {
          id: "1",
          question: "Market one?",
          conditionId: "m1",
          slug: "market-one",
          closed: true,
          umaResolutionStatus: "resolved",
        },
        {
          id: "2",
          question: "Market two?",
          conditionId: "m2",
          slug: "market-two",
          closed: true,
          umaResolutionStatus: "resolved",
        },
      ],
      [
        position({ wallet: "0xabc", conditionId: "m1", asset: "yes", realizedPnl: 5, totalBought: 100 }),
        position({ wallet: "0xabc", conditionId: "m2", asset: "yes", realizedPnl: 20, totalBought: 100 }),
        position({ wallet: "0xdef", conditionId: "m2", asset: "yes", realizedPnl: 100, totalBought: 100 }),
      ],
    );

    expect(rows.map((row) => row.conditionId)).toEqual(["m2", "m1"]);
    expect(rows[0]?.question).toBe("Market two?");
    expect(rows[0]?.side).toBe("Yes");
  });
});

describe("date-aware rows", () => {
  test("parseDateArg accepts YYYY-MM-DD and rejects invalid dates", () => {
    expect(parseDateArg("2024-01-31")?.toISOString()).toBe("2024-01-31T00:00:00.000Z");
    expect(() => parseDateArg("2024/01/31")).toThrow("--after must use YYYY-MM-DD");
    expect(() => parseDateArg("2024-02-31")).toThrow("--after must use a valid YYYY-MM-DD date");
    expect(() => parseDateArg("2024-99-99")).toThrow("--after must use a valid YYYY-MM-DD date");
  });

  test("filterRowsClosedAfter excludes rows closed before cutoff or missing closed date", () => {
    const rows = buildWalletMarketRows(
      [
        market({ conditionId: "old", closedTime: "2022-12-31T00:00:00Z" }),
        market({ conditionId: "new", closedTime: "2023-01-01T00:00:00Z" }),
        market({ conditionId: "unknown" }),
      ],
      [
        position({ wallet: "0xabc", conditionId: "old", asset: "yes", realizedPnl: 5, totalBought: 100 }),
        position({ wallet: "0xabc", conditionId: "new", asset: "yes", realizedPnl: 20, totalBought: 100 }),
        position({ wallet: "0xabc", conditionId: "unknown", asset: "yes", realizedPnl: 30, totalBought: 100 }),
      ],
    );

    expect(filterRowsClosedAfter(rows, new Date("2023-01-01T00:00:00.000Z")).map((row) => row.marketConditionId)).toEqual(["new"]);
  });

  test("score aggregation after date filter uses only filtered rows", () => {
    const appConfig = { ...config, minResolvedMarkets: 1, minResolvedPositions: 1, minTotalBought: 1 };
    const rows = buildWalletMarketRows(
      [
        market({ conditionId: "old", closedTime: "2022-01-01T00:00:00Z" }),
        market({ conditionId: "new", closedTime: "2024-01-01T00:00:00Z" }),
      ],
      [
        position({ wallet: "0xabc", conditionId: "old", asset: "yes", realizedPnl: 1000, totalBought: 1000 }),
        position({ wallet: "0xabc", conditionId: "new", asset: "yes", realizedPnl: 10, totalBought: 100 }),
      ],
    );

    const filtered = filterRowsClosedAfter(rows, new Date("2023-01-01T00:00:00.000Z"));
    const scores = scoreWallets("Politics", rowsToAggregates(filtered), appConfig);

    expect(scores[0]?.realizedPnl).toBe(10);
    expect(scores[0]?.resolvedMarkets).toBe(1);
  });

  test("shortlist rows select top wins by realized PnL", () => {
    const rows = buildWalletMarketRows(
      [
        market({ conditionId: "small", closedTime: "2024-01-01T00:00:00Z" }),
        market({ conditionId: "big", closedTime: "2024-01-02T00:00:00Z" }),
      ],
      [
        position({ wallet: "0xabc", conditionId: "small", asset: "yes", realizedPnl: 5, totalBought: 100 }),
        position({ wallet: "0xabc", conditionId: "big", asset: "yes", realizedPnl: 50, totalBought: 100 }),
      ],
    );

    expect(topRowsForWallet(rows, "0xabc", 1).map((row) => row.marketConditionId)).toEqual(["big"]);
  });
});

function market(input: { conditionId: string; closedTime?: string; outcomes?: string[]; outcomePrices?: string[]; outcomesRaw?: string }) {
  return {
    id: input.conditionId,
    question: `${input.conditionId}?`,
    conditionId: input.conditionId,
    slug: input.conditionId,
    closed: true,
    umaResolutionStatus: "resolved",
    closedTime: input.closedTime,
    outcomes: input.outcomesRaw ?? JSON.stringify(input.outcomes ?? ["Yes", "No"]),
    outcomePrices: JSON.stringify(input.outcomePrices ?? ["1", "0"]),
  };
}

function position(input: {
  wallet: string;
  conditionId: string;
  asset: string;
  realizedPnl: number;
  totalBought: number;
  outcomeIndex?: number;
}): MarketPosition {
  return {
    proxyWallet: input.wallet,
    name: null,
    asset: input.asset,
    conditionId: input.conditionId,
    avgPrice: 0,
    size: 0,
    currPrice: 0,
    currentValue: 0,
    cashPnl: 0,
    totalBought: input.totalBought,
    realizedPnl: input.realizedPnl,
    totalPnl: input.realizedPnl,
    outcome: input.outcomeIndex === 1 ? "No" : "Yes",
    outcomeIndex: input.outcomeIndex ?? 0,
  };
}
