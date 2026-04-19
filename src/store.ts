import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import type { GammaMarket, GammaTag, MarketPosition } from "./types.ts";

export class Store {
  private readonly db: Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  getTags(): GammaTag[] {
    return this.db.query("select id, label, slug from tags order by label collate nocase").all() as GammaTag[];
  }

  saveTags(tags: GammaTag[]): void {
    const insert = this.db.prepare("insert or replace into tags (id, label, slug, raw_json, fetched_at) values ($id, $label, $slug, $raw_json, $fetched_at)");
    const now = new Date().toISOString();
    const tx = this.db.transaction((items: GammaTag[]) => {
      for (const tag of items) {
        insert.run({ $id: tag.id, $label: tag.label, $slug: tag.slug, $raw_json: JSON.stringify(tag), $fetched_at: now });
      }
    });
    tx(tags);
  }

  getMarkets(tagId: string): GammaMarket[] {
    return this.db
      .query("select raw_json from markets where tag_id = $tag_id order by volume_num desc")
      .all({ $tag_id: tagId })
      .map((row) => JSON.parse((row as { raw_json: string }).raw_json) as GammaMarket);
  }

  saveMarkets(tagId: string, markets: GammaMarket[]): void {
    const insert = this.db.prepare(`
      insert or replace into markets (condition_id, tag_id, question, slug, closed, uma_resolution_status, volume_num, raw_json, fetched_at)
      values ($condition_id, $tag_id, $question, $slug, $closed, $uma_resolution_status, $volume_num, $raw_json, $fetched_at)
    `);
    const now = new Date().toISOString();
    const tx = this.db.transaction((items: GammaMarket[]) => {
      for (const market of items) {
        insert.run({
          $condition_id: market.conditionId,
          $tag_id: tagId,
          $question: market.question,
          $slug: market.slug,
          $closed: market.closed ? 1 : 0,
          $uma_resolution_status: market.umaResolutionStatus ?? null,
          $volume_num: market.volumeNum ?? null,
          $raw_json: JSON.stringify(market),
          $fetched_at: now,
        });
      }
    });
    tx(markets);
  }

  getPositions(conditionId: string): MarketPosition[] {
    return this.db
      .query("select raw_json from positions where condition_id = $condition_id")
      .all({ $condition_id: conditionId })
      .map((row) => JSON.parse((row as { raw_json: string }).raw_json) as MarketPosition);
  }

  savePositions(positions: MarketPosition[]): void {
    const insert = this.db.prepare(`
      insert or replace into positions (
        proxy_wallet, condition_id, asset, outcome_index, realized_pnl, total_bought, raw_json, fetched_at
      ) values (
        $proxy_wallet, $condition_id, $asset, $outcome_index, $realized_pnl, $total_bought, $raw_json, $fetched_at
      )
    `);
    const now = new Date().toISOString();
    const tx = this.db.transaction((items: MarketPosition[]) => {
      for (const position of items) {
        insert.run({
          $proxy_wallet: position.proxyWallet,
          $condition_id: position.conditionId,
          $asset: position.asset,
          $outcome_index: position.outcomeIndex,
          $realized_pnl: position.realizedPnl,
          $total_bought: position.totalBought,
          $raw_json: JSON.stringify(position),
          $fetched_at: now,
        });
      }
    });
    tx(positions);
  }

  saveAnalysisRun(input: {
    tagId: string;
    tagLabel: string;
    marketsAnalyzed: number;
    walletsConsidered: number;
    walletsPassingFilters: number;
  }): void {
    this.db
      .prepare(`
        insert into analysis_runs (tag_id, tag_label, markets_analyzed, wallets_considered, wallets_passing_filters, created_at)
        values ($tag_id, $tag_label, $markets_analyzed, $wallets_considered, $wallets_passing_filters, $created_at)
      `)
      .run({
        $tag_id: input.tagId,
        $tag_label: input.tagLabel,
        $markets_analyzed: input.marketsAnalyzed,
        $wallets_considered: input.walletsConsidered,
        $wallets_passing_filters: input.walletsPassingFilters,
        $created_at: new Date().toISOString(),
      });
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists tags (
        id text primary key,
        label text,
        slug text,
        raw_json text not null,
        fetched_at text not null
      );

      create table if not exists markets (
        condition_id text primary key,
        tag_id text not null,
        question text not null,
        slug text not null,
        closed integer not null,
        uma_resolution_status text,
        volume_num real,
        raw_json text not null,
        fetched_at text not null
      );

      create index if not exists idx_markets_tag_id on markets (tag_id);

      create table if not exists positions (
        proxy_wallet text not null,
        condition_id text not null,
        asset text not null,
        outcome_index integer not null,
        realized_pnl real not null,
        total_bought real not null,
        raw_json text not null,
        fetched_at text not null,
        primary key (proxy_wallet, condition_id, asset)
      );

      create index if not exists idx_positions_condition_id on positions (condition_id);

      create table if not exists analysis_runs (
        id integer primary key autoincrement,
        tag_id text not null,
        tag_label text not null,
        markets_analyzed integer not null,
        wallets_considered integer not null,
        wallets_passing_filters integer not null,
        created_at text not null
      );
    `);
  }
}
