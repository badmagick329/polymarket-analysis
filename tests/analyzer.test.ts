import { describe, expect, test } from "bun:test";
import { aggregateWalletMarkets, inspectWalletMarkets, scoreWallets } from "../src/analyzer.ts";
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
  });
});

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
