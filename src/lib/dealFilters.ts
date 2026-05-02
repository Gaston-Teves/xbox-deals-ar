import type {
  Deal,
  ContentTypeFilter,
  DealFilters,
  GameCategory,
  GameMode,
  Platform,
  SortOption,
} from "./types";

export const defaultFilters: DealFilters = {
  categories: [],
  modes: [],
  hideGamePass: false,
  onlyGamePass: false,
  hideFree: false,
  onlyDiscounted: false,
  contentType: "all",
};

const platforms: Platform[] = ["xbox", "pc", "play-anywhere", "unknown"];
const categories: GameCategory[] = [
  "action",
  "adventure",
  "rpg",
  "shooter",
  "sports",
  "racing",
  "strategy",
  "simulation",
  "horror",
  "platformer",
  "fighting",
  "puzzle",
  "indie",
  "family",
  "unknown",
];
const modes: GameMode[] = [
  "single-player",
  "local-coop",
  "online-coop",
  "local-multiplayer",
  "online-multiplayer",
  "cross-platform",
  "unknown",
];
const sortOptions: SortOption[] = [
  "price-asc",
  "discount-desc",
  "savings-desc",
  "newest",
];

type SearchParamsLike = {
  get(name: string): string | null;
};

export function filterDeals(deals: Deal[], filters: DealFilters): Deal[] {
  const search = filters.search?.trim().toLowerCase();
  const pcPlayableProductIds =
    filters.platform === "pc" ? getPcPlayableProductIds(deals).productIds : new Set<string>();

  return deals.filter((deal) => {
    if (filters.maxPrice !== undefined && deal.currentPrice > filters.maxPrice) {
      return false;
    }

    if (
      filters.minDiscount !== undefined &&
      (deal.discountPercent ?? 0) < filters.minDiscount
    ) {
      return false;
    }

    if (
      filters.platform &&
      !matchesPlatformFilter(deal, filters.platform, pcPlayableProductIds)
    ) {
      return false;
    }

    if (search && !deal.title.toLowerCase().includes(search)) {
      return false;
    }

    if (filters.hideGamePass && deal.isGamePass) {
      return false;
    }

    if (filters.onlyGamePass && !deal.isGamePass) {
      return false;
    }

    if (filters.hideFree && deal.currentPrice <= 0) {
      return false;
    }

    if (filters.onlyDiscounted && (deal.discountPercent ?? 0) <= 0) {
      return false;
    }

    if (
      filters.contentType &&
      filters.contentType !== "all" &&
      !matchesContentTypeFilter(deal.contentType, filters.contentType)
    ) {
      return false;
    }

    if (
      filters.categories.length > 0 &&
      !filters.categories.some((category) => deal.categories.includes(category))
    ) {
      return false;
    }

    if (
      filters.modes.length > 0 &&
      !filters.modes.some((mode) => deal.modes.includes(mode))
    ) {
      return false;
    }

    return true;
  });
}

export function markPcPlayableIncludedGames(deals: Deal[]): Deal[] {
  const included = getPcPlayableProductIds(deals);

  if (included.productIds.size === 0) {
    return deals;
  }

  return deals.map((deal) => {
    const includedTitle = included.includedTitleByProductId.get(deal.id);

    if (!includedTitle) {
      return deal;
    }

    return {
      ...deal,
      pcPlayableViaIncludedGame: includedTitle,
    };
  });
}

export function sortDeals(deals: Deal[], sort: SortOption = "price-asc"): Deal[] {
  return [...deals].sort((a, b) => {
    if (sort === "discount-desc") {
      return (
        (b.discountPercent ?? 0) - (a.discountPercent ?? 0) ||
        getDealSavings(b) - getDealSavings(a) ||
        a.currentPrice - b.currentPrice ||
        compareTitle(a, b)
      );
    }

    if (sort === "savings-desc") {
      return (
        getDealSavings(b) - getDealSavings(a) ||
        (b.discountPercent ?? 0) - (a.discountPercent ?? 0) ||
        a.currentPrice - b.currentPrice ||
        compareTitle(a, b)
      );
    }

    if (sort === "newest") {
      return (
        new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime() ||
        a.currentPrice - b.currentPrice ||
        compareTitle(a, b)
      );
    }

    return (
      a.currentPrice - b.currentPrice ||
      (b.discountPercent ?? 0) - (a.discountPercent ?? 0) ||
      compareTitle(a, b)
    );
  });
}

export function parseQueryFilters(searchParams: SearchParamsLike): {
  filters: DealFilters;
  sort: SortOption;
} {
  const maxPrice = parsePositiveNumber(searchParams.get("maxPrice"));
  const minDiscount = parsePositiveNumber(searchParams.get("minDiscount"));
  const platform = parsePlatform(searchParams.get("platform"));
  const search = searchParams.get("search")?.trim() || undefined;
  const hideGamePass = parseBoolean(searchParams.get("hideGamePass"));
  const onlyGamePass = parseBoolean(searchParams.get("onlyGamePass"));
  const hideFree = parseBoolean(searchParams.get("hideFree"));
  const onlyDiscounted = parseBoolean(searchParams.get("onlyDiscounted"));
  const contentType = parseContentTypeFilter(searchParams.get("contentType"));
  const parsedCategories = parseList(searchParams.get("categories"), categories);
  const parsedModes = parseList(searchParams.get("modes"), modes);
  const sort = parseSort(searchParams.get("sort"));

  return {
    filters: {
      maxPrice,
      minDiscount,
      platform,
      search,
      hideGamePass: onlyGamePass ? false : hideGamePass,
      onlyGamePass,
      hideFree,
      onlyDiscounted,
      contentType,
      categories: parsedCategories,
      modes: parsedModes,
    },
    sort,
  };
}

export function getDealSavings(deal: Deal): number {
  if (!deal.originalPrice || deal.originalPrice <= deal.currentPrice) {
    return 0;
  }

  return deal.originalPrice - deal.currentPrice;
}

export function getBestDealStats(deals: Deal[]) {
  const cheapestDeal = deals.reduce<Deal | undefined>(
    (current, deal) =>
      !current || deal.currentPrice < current.currentPrice ? deal : current,
    undefined,
  );
  const maxDiscountDeal = deals.reduce<Deal | undefined>(
    (current, deal) =>
      !current || (deal.discountPercent ?? 0) > (current.discountPercent ?? 0)
        ? deal
        : current,
    undefined,
  );
  const maxSavingsDeal = deals.reduce<Deal | undefined>(
    (current, deal) =>
      !current || getDealSavings(deal) > getDealSavings(current) ? deal : current,
    undefined,
  );

  return {
    total: deals.length,
    cheapestDeal,
    maxDiscountDeal,
    maxSavingsDeal,
    historicalLowCount: deals.filter((deal) => deal.isHistoricalLow).length,
    newCount: deals.filter((deal) => deal.priceChange === "new").length,
    priceDropCount: deals.filter((deal) => deal.priceChange === "down").length,
  };
}

function parsePositiveNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseBoolean(value: string | null): boolean {
  return value === "true" || value === "1";
}

function parsePlatform(value: string | null): Platform | undefined {
  if (!value || value === "all") {
    return undefined;
  }

  return platforms.includes(value as Platform) ? (value as Platform) : undefined;
}

function matchesPlatformFilter(
  deal: Deal,
  filter: Platform,
  pcPlayableProductIds: Set<string>,
): boolean {
  if (filter === "pc") {
    return (
      deal.platform === "pc" ||
      deal.platform === "play-anywhere" ||
      pcPlayableProductIds.has(deal.id)
    );
  }

  if (filter === "xbox") {
    return deal.platform === "xbox" || deal.platform === "play-anywhere";
  }

  return deal.platform === filter;
}

function matchesContentTypeFilter(
  contentType: Deal["contentType"],
  filter: ContentTypeFilter,
): boolean {
  if (filter === "base-games") {
    return contentType === "base-game";
  }

  if (filter === "bundles-editions") {
    return contentType === "bundle" || contentType === "edition";
  }

  if (filter === "add-ons") {
    return contentType === "add-on";
  }

  return true;
}

function parseContentTypeFilter(value: string | null): ContentTypeFilter {
  if (
    value === "base-games" ||
    value === "bundles-editions" ||
    value === "add-ons"
  ) {
    return value;
  }

  return "all";
}

function parseSort(value: string | null): SortOption {
  return sortOptions.includes(value as SortOption)
    ? (value as SortOption)
    : "price-asc";
}

function parseList<T extends string>(value: string | null, allowed: T[]): T[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is T => allowed.includes(item as T));
}

function getPcPlayableProductIds(deals: Deal[]): {
  productIds: Set<string>;
  includedTitleByProductId: Map<string, string>;
} {
  const pcBaseGameTitles = deals
    .filter((deal) => deal.contentType === "base-game")
    .filter((deal) => deal.platform === "pc" || deal.platform === "play-anywhere")
    .map((deal) => ({
      id: deal.id,
      title: normalizeComparableTitle(deal.title),
      displayTitle: deal.title,
    }))
    .filter((deal) => deal.title.length >= 3)
    .sort((a, b) => a.title.length - b.title.length);
  const productIds = new Set<string>();
  const includedTitleByProductId = new Map<string, string>();

  deals
    .filter((deal) => deal.contentType === "base-game")
    .filter((deal) => deal.platform === "xbox")
    .forEach((deal) => {
      const title = normalizeComparableTitle(deal.title);

      if (!isEditionLikeTitle(title)) {
        return;
      }

      const includedBase = pcBaseGameTitles.find(
        (candidate) =>
          candidate.id !== deal.id &&
          (title === candidate.title ||
            title.startsWith(`${candidate.title} `) ||
            title.includes(` ${candidate.title} `)),
      );

      if (includedBase) {
        productIds.add(deal.id);
        includedTitleByProductId.set(deal.id, includedBase.displayTitle);
      }
    });

  return { productIds, includedTitleByProductId };
}

function isEditionLikeTitle(title: string): boolean {
  return /\b(edition|edicion|paquete|bundle|pack|collection|coleccion)\b/.test(
    title,
  );
}

function normalizeComparableTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(pc|windows|xbox|one|series|xs)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compareTitle(a: Deal, b: Deal): number {
  return a.title.localeCompare(b.title, "es-AR");
}
