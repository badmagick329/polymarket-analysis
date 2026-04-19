export type AppConfig = {
  dbPath: string;
  marketFetchLimit: number;
  positionsPageSize: number;
  maxPositionPagesPerMarket: number;
  minResolvedMarkets: number;
  minResolvedPositions: number;
  minTotalBought: number;
  minRoi: number;
  minPositiveMarketRate: number;
  defaultResultLimit: number;
  defaultShortlistShow: number;
  defaultTopicsLimit: number;
  maxActivityChecks: number;
  api: {
    gammaBaseUrl: string;
    dataBaseUrl: string;
  };
};

export const config: AppConfig = {
  dbPath: "data/polymarket.sqlite",
  marketFetchLimit: 100,
  positionsPageSize: 100,
  maxPositionPagesPerMarket: 5,
  minResolvedMarkets: 2,
  minResolvedPositions: 2,
  minTotalBought: 100,
  minRoi: 0,
  minPositiveMarketRate: 0.5,
  defaultResultLimit: 25,
  defaultShortlistShow: 3,
  defaultTopicsLimit: 100,
  maxActivityChecks: 250,
  api: {
    gammaBaseUrl: "https://gamma-api.polymarket.com",
    dataBaseUrl: "https://data-api.polymarket.com",
  },
};
