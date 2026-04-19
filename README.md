# Polymarket Analysis

A local CLI tool for finding Polymarket wallets that have shown repeatable profitable results inside a topic.

The goal is simple:

> Given a topic like `politics`, find wallets that performed well across resolved markets, with enough activity to be worth looking at further.

This tool does **not** predict markets. It does **not** prove someone has inside information. It surfaces wallets whose historical resolved results look strong enough to inspect.

## Install

```bash
bun install
```

## List Topics

Polymarket topics are tags. The CLI works best with an exact tag `slug` or `id`.

List topics:

```bash
bun run index.ts topics --limit 25
```

Search topics:

```bash
bun run index.ts topics --search politics --limit 10
```

Use the `slug` value in commands like `analyze`, `shortlist`, and `inspect`.

## Analyze a Topic

```bash
bun run index.ts analyze politics --limit 10
```

This finds resolved Polymarket markets tagged with `politics`, gathers wallet performance, filters out weak samples, and prints the top ranked wallets.

You can use other Polymarket tag names or slugs:

```bash
bun run index.ts analyze crypto --limit 10
bun run index.ts analyze sports --limit 10
```

If a topic is ambiguous, the CLI prints matching tag choices and asks you to use an exact slug or id.

To rank only markets that closed after a specific date:

```bash
bun run index.ts analyze politics --after 2023-01-01 --limit 10
```

For `analyze`, `--after` uses the market/result closed date. Rows without a closed date are excluded.

## Shortlist Wallets

`shortlist` is the easiest discovery workflow. It ranks wallets like `analyze`, then shows the top market wins under each wallet.

```bash
bun run index.ts shortlist politics --after 2023-01-01 --active-within-years 2 --limit 10 --show 3
```

This helps avoid the old manual flow of:

1. run `analyze`
2. pick a wallet
3. run `inspect`
4. discover there are no matching recent results

Use:

- `--after YYYY-MM-DD` to rank only results after a date
- `--active-within-years N` to keep wallets active recently anywhere on Polymarket
- `--limit N` to choose how many wallets to show
- `--show N` to choose how many market wins to show under each wallet

## Filter for Recently Active Wallets

To ignore wallets that have not been active in recent years:

```bash
bun run index.ts analyze politics --limit 10 --active-within-years 2
```

Examples:

- `--active-within-years 1` keeps wallets active since last year or this year
- `--active-within-years 2` keeps wallets active within roughly the last 2 years
- `--active-within-years 3` keeps wallets active within roughly the last 3 years
- `--active-within-years 4` keeps wallets active within roughly the last 4 years

The output includes `activeYear`, which is the latest year where the wallet has public Polymarket activity.

This filter is different from `--after`:

- `--after` filters topic performance by market closed date
- `--active-within-years` filters whether the wallet is still active anywhere on Polymarket

## Inspect a Wallet

After finding an interesting wallet, inspect its market-level results:

```bash
bun run index.ts inspect 0x8c2f...64fa politics --limit 10
```

You can use either:

- the full wallet address
- the shortened address shown in the table, such as `0x8c2f...64fa`

`inspect` helps answer:

- Did this wallet win across many unrelated markets?
- Did most profit come from one cluster?
- Were the markets old or recent?
- Was the wallet active before the market closed?

You can also show only market results after a specific date:

```bash
bun run index.ts inspect 0x8c2f...64fa politics --limit 10 --after 2023-01-01
```

The date must use `YYYY-MM-DD`. Like `analyze` and `shortlist`, this filter uses the closed date. Rows without a closed date are excluded.

## Metrics

### `rank`

The wallet's position after sorting by `edgeScore`.

### `wallet`

The Polymarket proxy wallet address. The table shortens it for readability.

### `edgeScore`

The main ranking score used by this tool.

Higher means the wallet has a stronger mix of:

- realized profit
- return on capital
- repeat positive results
- enough resolved markets
- enough total activity

`edgeScore` is not an official Polymarket metric. It is a simple ranking heuristic for research.

### `realizedPnl`

The wallet's realized profit or loss in the resolved markets being analyzed.

Higher is better, but this should not be used alone. A wallet can make a lot from one big market without showing repeatable edge.

### `roi`

Return on investment:

```text
realizedPnl / totalBought
```

Higher ROI means the wallet made more profit relative to the amount it bought.

ROI is useful, but it can be noisy on small samples.

### `positiveRate`

The percentage of resolved markets where the wallet had positive realized PnL.

Example:

```text
100% positiveRate across 7 markets = profitable in all 7 markets
```

This helps identify repeatability, but it should be read together with profit and activity.

### `markets`

How many resolved markets were counted for this wallet in the topic.

More markets usually means stronger evidence.

### `positions`

How many closed outcome positions were counted.

A wallet can have multiple positions within one market.

### `totalBought`

Total amount bought across the counted positions.

This helps filter out tiny accounts or lucky low-size wins.

### `activeYear`

The latest year where the wallet has public Polymarket activity.

This only appears when using `--active-within-years`.

## Inspect Metrics

The `inspect` command prints each market counted for a wallet.

### `positionOpened`

Earliest known trade date for that wallet in that market.

Sometimes this is `unknown` because older Polymarket trade history is not always available through the public API.

### `marketOpened`

Date the market/question opened.

This is useful when `positionOpened` is unknown.

### `closed`

Date the position or market closed, based on available public API data.

### `--after`

Filters rows to results after a specific date.

Example:

```bash
bun run index.ts inspect 0x8c2f...64fa politics --after 2023-01-01
```

For `analyze`, `shortlist`, and `inspect`, this uses the closed date. Rows without a closed date are excluded.

### `outcomes`

The outcome side the wallet held, such as `Yes` or `No`.

### `question`

The market question.

Use this to see whether the wallet's performance came from diverse markets or one narrow cluster.

## What Edge Score Means

Ranking by one metric is misleading:

- PnL alone favors whales and one big win
- ROI alone favors tiny lucky bets
- positive rate alone ignores whether the wallet made meaningful money
- market count alone ignores whether the wallet was profitable

`edgeScore` combines these signals so the top results are more likely to be useful.

It rewards wallets that:

- made positive realized PnL
- had good ROI
- were profitable across multiple resolved markets
- deployed meaningful size
- had enough activity to reduce noise

Read it as:

> "This wallet has a strong historical signal in this topic and is worth inspecting."

Do **not** read it as:

> "This wallet is guaranteed to be skilled."

## How to Interpret Results

A good candidate usually has:

- positive realized PnL
- ROI above 0
- positiveRate above 50%
- multiple resolved markets
- meaningful totalBought
- recent activity, if you care about active wallets

Be careful with:

- wallets with only 1-2 markets
- huge PnL from one market cluster
- very high ROI on tiny size
- old wallets with no recent activity
- market-making or hedging behavior that may look profitable but is not directional prediction

The best workflow is usually:

1. Run `shortlist` with `--after`
2. Look at the wallets and the market wins shown underneath
3. Run `inspect` on any wallet that looks interesting
4. Decide whether the pattern looks meaningful

## Data Notes

This tool uses public Polymarket APIs only.

Results are cached locally in SQLite under `data/` so repeated runs are faster.

Cached data includes market data, market positions, wallet activity years, and wallet-market date metadata used by `inspect`.

The data is useful for research, but it has limitations:

- topic tags may be imperfect
- some older trade timestamps may be unavailable
- public results do not reveal trader intent
- historical performance does not prove future performance
