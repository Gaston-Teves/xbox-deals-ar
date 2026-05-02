export type Platform = "xbox" | "pc" | "play-anywhere" | "unknown";

export type GameCategory =
  | "action"
  | "adventure"
  | "rpg"
  | "shooter"
  | "sports"
  | "racing"
  | "strategy"
  | "simulation"
  | "horror"
  | "platformer"
  | "fighting"
  | "puzzle"
  | "indie"
  | "family"
  | "unknown";

export type GameMode =
  | "single-player"
  | "local-coop"
  | "online-coop"
  | "local-multiplayer"
  | "online-multiplayer"
  | "cross-platform"
  | "unknown";

export type DealContentType =
  | "base-game"
  | "bundle"
  | "edition"
  | "add-on"
  | "unknown";

export type ContentTypeFilter =
  | "all"
  | "base-games"
  | "bundles-editions"
  | "add-ons";

export type SortOption =
  | "price-asc"
  | "discount-desc"
  | "savings-desc"
  | "newest";

export type ExternalStore = "steam";

export type ExternalStorePrice = {
  store: ExternalStore;
  externalId: string;
  externalType?: string;
  title: string;
  url: string;
  currentPrice?: number;
  originalPrice?: number;
  discountPercent?: number;
  currency: string;
  matchConfidence: number;
  fetchedAt: string;
};

export type DealFilters = {
  maxPrice?: number;
  minDiscount?: number;
  platform?: Platform;
  search?: string;
  hideGamePass?: boolean;
  onlyGamePass?: boolean;
  hideFree?: boolean;
  onlyDiscounted?: boolean;
  contentType?: ContentTypeFilter;
  categories: GameCategory[];
  modes: GameMode[];
};

export type Deal = {
  id: string;
  productId?: string;
  title: string;
  imageUrl?: string;
  storeUrl: string;
  currentPrice: number;
  originalPrice?: number;
  discountPercent?: number;
  currency: "ARS";
  platform: Platform;
  isGamePass: boolean;
  contentType: DealContentType;
  categories: GameCategory[];
  modes: GameMode[];
  detectedAt: string;
  firstDetectedAt?: string;
  lastSeenAt?: string;
  lowestPrice?: number;
  lowestPriceAt?: string;
  previousPrice?: number;
  priceChange?: "new" | "down" | "up" | "same" | "unknown";
  isHistoricalLow?: boolean;
  externalPrices?: ExternalStorePrice[];
  pcPlayableViaIncludedGame?: string;
};
