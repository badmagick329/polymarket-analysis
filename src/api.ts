import type { AppConfig } from "./config.ts";
import type { GammaMarket, GammaTag, MarketPosition } from "./types.ts";

type MarketsResponse = {
  markets?: GammaMarket[];
  next_cursor?: string;
};

type MarketPositionsResponse = {
  token: string;
  positions: MarketPosition[];
}[];

export class PolymarketApi {
  constructor(private readonly appConfig: AppConfig) {}

  async fetchTags(): Promise<GammaTag[]> {
    const url = new URL("/tags", this.appConfig.api.gammaBaseUrl);
    url.searchParams.set("limit", "10000");
    url.searchParams.set("order", "id");
    url.searchParams.set("ascending", "true");
    const data = await this.getJson<GammaTag[]>(url);
    return data.filter((tag) => tag.id && (tag.slug || tag.label));
  }

  async fetchTagBySlug(slug: string): Promise<GammaTag | null> {
    const url = new URL(`/tags/slug/${encodeURIComponent(slug)}`, this.appConfig.api.gammaBaseUrl);
    const response = await fetch(url);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`GET ${url.toString()} failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as GammaTag;
  }

  async fetchResolvedMarketsForTag(tagId: string): Promise<GammaMarket[]> {
    const markets: GammaMarket[] = [];
    let cursor: string | undefined;

    while (markets.length < this.appConfig.marketFetchLimit) {
      const url = new URL("/markets/keyset", this.appConfig.api.gammaBaseUrl);
      url.searchParams.set("tag_id", tagId);
      url.searchParams.set("closed", "true");
      url.searchParams.set("include_tag", "true");
      url.searchParams.set("limit", String(Math.min(100, this.appConfig.marketFetchLimit - markets.length)));
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const data = await this.getJson<MarketsResponse>(url);
      const page = data.markets ?? [];
      markets.push(...page.filter(isUsableResolvedMarket));

      if (!data.next_cursor || page.length === 0) break;
      cursor = data.next_cursor;
    }

    return markets.slice(0, this.appConfig.marketFetchLimit);
  }

  async fetchClosedPositionsForMarket(conditionId: string): Promise<MarketPosition[]> {
    const positions: MarketPosition[] = [];

    for (let page = 0; page < this.appConfig.maxPositionPagesPerMarket; page += 1) {
      const url = new URL("/v1/market-positions", this.appConfig.api.dataBaseUrl);
      url.searchParams.set("market", conditionId);
      url.searchParams.set("status", "CLOSED");
      url.searchParams.set("limit", String(this.appConfig.positionsPageSize));
      url.searchParams.set("offset", String(page * this.appConfig.positionsPageSize));

      const data = await this.getJson<MarketPositionsResponse>(url);
      const pagePositions = data.flatMap((tokenPositions) => tokenPositions.positions ?? []);
      positions.push(...pagePositions);

      const hasFullTokenPage = data.some(
        (tokenPositions) => (tokenPositions.positions?.length ?? 0) >= this.appConfig.positionsPageSize,
      );
      if (!hasFullTokenPage) break;
    }

    return positions;
  }

  private async getJson<T>(url: URL): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GET ${url.toString()} failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }
}

function isUsableResolvedMarket(market: GammaMarket): boolean {
  return Boolean(market.closed && market.conditionId && market.umaResolutionStatus === "resolved");
}
