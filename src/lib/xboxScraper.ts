import type { Deal, DealContentType, GameCategory, GameMode, Platform } from "./types";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MICROSOFT_STORE_PAGE_SIZE = 50;
const DEFAULT_MICROSOFT_STORE_MAX_PAGES = 4;
const SOURCE_CONCURRENCY = 4;
const PAGE_CONCURRENCY = 3;
const MICROSOFT_STORE_PLATFORMS = ["xbox", "pc"] as const;
const MICROSOFT_STORE_COLLECTIONS = [
  "top-paid",
  "new",
  "best-rated",
  "most-played",
  "top-free",
  "deals",
  "game-demos",
  "game-previews",
  "coming-soon",
] as const;
const MICROSOFT_STORE_CATEGORY_FILTERS = [
  "Action+%26+adventure",
  "Card+%26+board",
  "Classics",
  "Family+%26+kids",
  "Fighting",
  "Platformer",
  "Puzzle+%26+trivia",
  "Racing+%26+flying",
  "Role+playing",
  "Shooter",
  "Simulation",
  "Sports",
  "Strategy",
] as const;
const MICROSOFT_STORE_PRICE_FILTERS = [
  "0To0.01",
  "0.01To6000",
  "6000To20000",
  "20000To50000",
  "50000To90000",
  "90000To100000",
  "100000To",
] as const;
const CATALOG_URL = "https://displaycatalog.mp.microsoft.com/v7.0/products";

let memoryCache: {
  deals: Deal[];
  fetchedAt: number;
} | null = null;

export type FetchXboxDealsOptions = {
  forceRefresh?: boolean;
};

type RawMicrosoftStoreDeal = {
  productId: string;
  title?: string;
  imageUrl?: string;
  storeUrl?: string;
  currentPrice?: number;
  originalPrice?: number;
  discountPercent?: number;
  platformHint?: Platform;
  isGamePass?: boolean;
  detectedAt?: string;
};

type CatalogProduct = {
  ProductId?: string;
  ProductKind?: string;
  ProductType?: string;
  LocalizedProperties?: Array<{
    ProductTitle?: string;
    Images?: Array<{
      ImagePurpose?: string;
      Uri?: string;
      Width?: number;
      Height?: number;
    }>;
  }>;
  Properties?: {
    Attributes?: Array<{
      Name?: string;
      ApplicablePlatforms?: string[] | null;
    }>;
    Category?: string;
    Categories?: string[];
    XboxXPA?: unknown;
    XboxConsoleGenCompatible?: string[];
  };
  PreferredSkuId?: string;
  DisplaySkuAvailabilities?: Array<{
    Sku?: {
      SkuId?: string;
    };
    Availabilities?: Array<{
      Actions?: string[];
      RemediationRequired?: boolean;
      OrderManagementData?: {
        Price?: {
          CurrencyCode?: string;
          ListPrice?: number;
          MSRP?: number;
        };
      };
    }>;
  }>;
};

type MicrosoftCard = {
  productId?: string;
  title?: string;
  pdpUri?: string;
  subscriptionBadgeText?: string;
  image?: {
    uri?: string;
  };
  price?: {
    currentPrice?: string;
    originalPrice?: string;
  };
};

type XboxAvailabilitySummary = Record<
  string,
  Record<
    string,
    Record<
      string,
      {
        productId?: string;
        price?: {
          currency?: string;
          listPrice?: number;
          msrp?: number;
          discountPercentage?: number;
        };
      }
    >
  >
>;

type CatalogPrice = {
  currentPrice: number;
  originalPrice?: number;
};

export async function fetchXboxArgentinaDeals(
  options: FetchXboxDealsOptions = {},
): Promise<Deal[]> {
  const now = Date.now();

  if (
    !options.forceRefresh &&
    memoryCache &&
    now - memoryCache.fetchedAt < CACHE_TTL_MS
  ) {
    return memoryCache.deals;
  }

  try {
    const rawDeals = await fetchDealsFromMicrosoftStore();
    const deals = await mapRawDealsToDeals(rawDeals);

    memoryCache = {
      deals,
      fetchedAt: now,
    };

    return deals;
  } catch (error) {
    console.error("Fallo la fuente oficial de ofertas.", error);

    if (memoryCache) {
      return memoryCache.deals;
    }

    return [];
  }
}

export async function fetchDealsFromMicrosoftStore(): Promise<
  RawMicrosoftStoreDeal[]
> {
  const sourceUrls = getSourceUrls();
  const settledSources = await runWithConcurrency(
    sourceUrls,
    SOURCE_CONCURRENCY,
    (sourceUrl) => fetchDealsFromSourceWithPagination(sourceUrl),
  );
  const rawDeals = settledSources.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  return dedupeRawDeals(rawDeals);
}

export function parseMicrosoftStoreHtml(
  html: string,
  platformHint?: Platform,
): RawMicrosoftStoreDeal[] {
  const cards = extractJsonArrayAfterMarker<MicrosoftCard>(html, '"cards":[');
  const deals = cards
    .map<RawMicrosoftStoreDeal | undefined>((card) => {
      if (!card.productId) {
        return undefined;
      }

      const currentPrice = card.price?.currentPrice
        ? normalizeArgentinePrice(card.price.currentPrice)
        : undefined;
      const isGamePass = Boolean(card.subscriptionBadgeText);
      const originalPrice = card.price?.originalPrice
        ? normalizeArgentinePrice(card.price.originalPrice)
        : undefined;
      const normalizedCurrentPrice =
        currentPrice === 0 && isGamePass ? undefined : currentPrice;
      const discountPercent =
        normalizedCurrentPrice !== undefined
          ? getDiscountPercent(normalizedCurrentPrice, originalPrice)
          : undefined;

      return {
        productId: card.productId.toUpperCase(),
        title: card.title,
        imageUrl: normalizeImageUrl(card.image?.uri),
        storeUrl: card.pdpUri,
        currentPrice: normalizedCurrentPrice,
        originalPrice,
        discountPercent,
        platformHint,
        isGamePass,
        detectedAt: new Date().toISOString(),
      };
    })
    .filter((deal): deal is RawMicrosoftStoreDeal => Boolean(deal));

  return deals;
}

export function normalizeArgentinePrice(text: string): number | undefined {
  if (/\b(gratis|free)\b/i.test(text)) {
    return 0;
  }

  const cleaned = text.replace(/[^\d,.-]/g, "").trim();

  if (!cleaned) {
    return undefined;
  }

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function mapRawDealToDeal(
  raw: RawMicrosoftStoreDeal,
  product?: CatalogProduct,
): Deal {
  const catalogPrice = findBestCatalogPrice(product);
  const currentPrice = raw.currentPrice ?? catalogPrice?.currentPrice ?? 0;
  const originalPrice = raw.originalPrice ?? catalogPrice?.originalPrice;
  const title =
    normalizeTitle(product?.LocalizedProperties?.[0]?.ProductTitle, raw.title) ??
    raw.productId;
  const imageUrl =
    pickProductImage(product) ?? raw.imageUrl ?? undefined;
  const platform = detectPlatform(product, raw.platformHint);
  const categories = mapCategories(product);
  const modes = mapModes(product);
  const contentType = detectContentType(title, product);

  return {
    id: raw.productId,
    productId: raw.productId,
    title,
    imageUrl,
    storeUrl: raw.storeUrl ?? buildXboxStoreUrl(title, raw.productId),
    currentPrice,
    originalPrice,
    discountPercent:
      raw.discountPercent ?? getDiscountPercent(currentPrice, originalPrice),
    currency: "ARS",
    platform,
    isGamePass: raw.isGamePass ?? false,
    contentType,
    categories,
    modes,
    detectedAt: raw.detectedAt ?? new Date().toISOString(),
  };
}

async function fetchDealsFromSourceWithPagination(
  sourceUrl: string,
): Promise<RawMicrosoftStoreDeal[]> {
  if (!sourceUrl.includes("microsoft.com")) {
    return fetchDealsFromSource(sourceUrl);
  }

  const maxPages = getMicrosoftStoreMaxPages();
  const pages = Array.from({ length: maxPages }, (_, index) => {
    const url = new URL(sourceUrl);

    if (index > 0) {
      url.searchParams.set("skipItems", String(index * MICROSOFT_STORE_PAGE_SIZE));
    }

    return url.toString();
  });
  const settledPages = await runWithConcurrency(
    pages,
    PAGE_CONCURRENCY,
    (pageUrl) => fetchDealsFromSource(pageUrl),
  );
  const deals = settledPages.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  return dedupeRawDeals(deals);
}

async function fetchDealsFromSource(sourceUrl: string): Promise<RawMicrosoftStoreDeal[]> {
  const response = await fetch(sourceUrl, {
    headers: {
      "Accept-Language": "es-AR,es;q=0.9,en;q=0.7",
      "User-Agent": "xbox-deals-ar/0.1 (+personal price tracker)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Microsoft Store respondio ${response.status}`);
  }

  const html = await response.text();

  if (sourceUrl.includes("xbox.com")) {
    return parseXboxBrowseHtml(html);
  }

  return parseMicrosoftStoreHtml(html, sourceUrl.includes("/pc") ? "pc" : "xbox");
}

function parseXboxBrowseHtml(html: string): RawMicrosoftStoreDeal[] {
  const summaries = extractJsonObjectAfterMarker<XboxAvailabilitySummary>(
    html,
    '"availabilitySummaries":',
  );
  const productIds = extractXboxBrowseProductIds(html);
  const detectedAt = new Date().toISOString();

  const entries =
    productIds.length > 0
      ? productIds.map((productId) => [productId, summaries[productId]] as const)
      : Object.entries(summaries);

  const deals = entries
    .map<RawMicrosoftStoreDeal | undefined>(([productId, skuMap]) => {
      const price = findBestPrice(skuMap);

      if (!price || price.currency !== "ARS" || price.listPrice === undefined) {
        return undefined;
      }

      return {
        productId: productId.toUpperCase(),
        currentPrice: price.listPrice,
        originalPrice: price.msrp,
        discountPercent:
          price.discountPercentage !== undefined
            ? Math.round(price.discountPercentage)
            : getDiscountPercent(price.listPrice, price.msrp),
        platformHint: "xbox" as Platform,
        isGamePass: sourceHasGamePassFilter(html),
        detectedAt,
      };
    })
    .filter((deal): deal is RawMicrosoftStoreDeal => Boolean(deal));

  return deals.filter(
    (deal) => deal.currentPrice !== undefined && deal.currentPrice > 0,
  );
}

async function mapRawDealsToDeals(rawDeals: RawMicrosoftStoreDeal[]): Promise<Deal[]> {
  if (rawDeals.length === 0) {
    return [];
  }

  const products = await fetchCatalogProducts(rawDeals.map((deal) => deal.productId));
  const productById = new Map(
    products.map((product) => [product.ProductId?.toUpperCase(), product]),
  );

  return rawDeals
    .filter((rawDeal) => isGameProduct(productById.get(rawDeal.productId)))
    .map((rawDeal) => {
      const product = productById.get(rawDeal.productId);
      const catalogPrice = findBestCatalogPrice(product);

      if (rawDeal.currentPrice === undefined && !catalogPrice) {
        return undefined;
      }

      return mapRawDealToDeal(rawDeal, product);
    })
    .filter((deal): deal is Deal => Boolean(deal))
    .filter((deal) => deal.currentPrice >= 0)
    .sort((a, b) => a.currentPrice - b.currentPrice);
}

async function fetchCatalogProducts(productIds: string[]): Promise<CatalogProduct[]> {
  const uniqueIds = [...new Set(productIds.map((id) => id.toUpperCase()))];
  const chunks = chunk(uniqueIds, 40);
  const products: CatalogProduct[] = [];

  for (const ids of chunks) {
    const url = new URL(CATALOG_URL);
    url.searchParams.set("market", "AR");
    url.searchParams.set("languages", "es-ar");
    url.searchParams.set("bigIds", ids.join(","));

    const response = await fetch(url, {
      headers: {
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.7",
        "User-Agent": "xbox-deals-ar/0.1 (+personal price tracker)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      continue;
    }

    const data = (await response.json()) as { Products?: CatalogProduct[] };
    products.push(...(data.Products ?? []));
  }

  return products;
}

function findBestPrice(
  skuMap: XboxAvailabilitySummary[string],
): {
  currency?: string;
  listPrice?: number;
  msrp?: number;
  discountPercentage?: number;
} | undefined {
  const prices = Object.values(skuMap).flatMap((availabilityMap) =>
    Object.values(availabilityMap)
      .map((availability) => availability.price)
      .filter((price): price is NonNullable<typeof price> => Boolean(price)),
  );

  return prices.sort((a, b) => (a.listPrice ?? Infinity) - (b.listPrice ?? Infinity))[0];
}

function isGameProduct(product?: CatalogProduct): boolean {
  if (!product) {
    return false;
  }

  return product.ProductType === "Game" || product.ProductKind === "Game";
}

function findBestCatalogPrice(
  product?: CatalogProduct,
): CatalogPrice | undefined {
  const preferredSkuId = product?.PreferredSkuId;
  const prices =
    product?.DisplaySkuAvailabilities?.filter(
      (skuAvailability) =>
        !preferredSkuId || skuAvailability.Sku?.SkuId === preferredSkuId,
    ).flatMap((skuAvailability) =>
      skuAvailability.Availabilities?.map<CatalogPrice | undefined>((availability) => {
        const price = availability.OrderManagementData?.Price;
        const isPurchasable =
          availability.Actions?.some((action) =>
            ["Purchase", "Fulfill", "Gift"].includes(action),
          ) ?? false;

        if (
          price?.CurrencyCode !== "ARS" ||
          price.ListPrice === undefined ||
          availability.RemediationRequired ||
          !isPurchasable
        ) {
          return undefined;
        }

        return {
          currentPrice: Number(price.ListPrice),
          originalPrice: price.MSRP !== undefined ? Number(price.MSRP) : undefined,
        };
      }).filter(
        (price): price is CatalogPrice =>
          price !== undefined && Number.isFinite(price.currentPrice),
      ) ?? [],
    ) ?? [];

  return prices.sort((a, b) => a.currentPrice - b.currentPrice)[0];
}

function detectContentType(
  title: string,
  product?: CatalogProduct,
): DealContentType {
  const normalizedTitle = title.toLowerCase();
  const productType = product?.ProductType?.toLowerCase();
  const productKind = product?.ProductKind?.toLowerCase();

  if (productType && productType !== "game" && productKind !== "game") {
    return "add-on";
  }

  if (
    /\b(dlc|upgrade|mejora|expansion|expansion|expansión|season pass|pase de|add-on|complemento|coins|monedas|zen)\b/i.test(
      normalizedTitle,
    )
  ) {
    return "add-on";
  }

  if (/\b(bundle|paquete|pack|collection|coleccion|colección)\b/i.test(normalizedTitle)) {
    return "bundle";
  }

  if (/\b(deluxe|ultimate|gold|definitive|definitiva|premium)\b/i.test(normalizedTitle)) {
    return "edition";
  }

  return "base-game";
}

function dedupeRawDeals(rawDeals: RawMicrosoftStoreDeal[]): RawMicrosoftStoreDeal[] {
  const byProductId = new Map<string, RawMicrosoftStoreDeal>();

  rawDeals.forEach((deal) => {
    const existing = byProductId.get(deal.productId);

    if (
      !existing ||
      (deal.currentPrice !== undefined &&
        (existing.currentPrice === undefined ||
          deal.currentPrice < existing.currentPrice))
    ) {
      byProductId.set(deal.productId, {
        ...existing,
        ...deal,
        isGamePass: existing?.isGamePass || deal.isGamePass,
      });
      return;
    }

    byProductId.set(deal.productId, {
      ...existing,
      title: existing.title ?? deal.title,
      imageUrl: existing.imageUrl ?? deal.imageUrl,
      storeUrl: existing.storeUrl ?? deal.storeUrl,
      currentPrice: existing.currentPrice ?? deal.currentPrice,
      originalPrice: existing.originalPrice ?? deal.originalPrice,
      discountPercent: existing.discountPercent ?? deal.discountPercent,
      isGamePass: existing.isGamePass || deal.isGamePass,
    });
  });

  return [...byProductId.values()];
}

function getSourceUrls(): string[] {
  const customSource = process.env.XBOX_DEALS_SOURCE_URL?.trim();

  if (!customSource) {
    return buildDefaultSourceUrls();
  }

  return customSource
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

function buildDefaultSourceUrls(): string[] {
  const xboxUrls = [
    "https://www.xbox.com/es-AR/games/all-games",
    "https://www.xbox.com/es-AR/games/browse?orderby=Price%20asc",
    "https://www.xbox.com/es-AR/games/browse?orderby=Price%20asc&PlayWith=PC",
    "https://www.xbox.com/es-AR/games/browse?orderby=Title%20asc",
    "https://www.xbox.com/es-AR/games/browse?orderby=ReleaseDate%20desc",
    "https://www.xbox.com/es-AR/games/browse/DynamicChannel.GameDeals",
    "https://www.xbox.com/es-AR/games/browse?IncludedInSubscription=GamePass",
    "https://www.xbox.com/es-AR/games/browse?IncludedInSubscription=PCGamePass",
  ];
  const collectionUrls = MICROSOFT_STORE_COLLECTIONS.flatMap((collection) =>
    MICROSOFT_STORE_PLATFORMS.map(
      (platform) =>
        `https://www.microsoft.com/es-ar/store/${collection}/games/${platform}`,
    ),
  );
  const categoryUrls = MICROSOFT_STORE_CATEGORY_FILTERS.flatMap((category) =>
    MICROSOFT_STORE_PLATFORMS.map(
      (platform) =>
        `https://www.microsoft.com/es-ar/store/top-paid/games/${platform}?category=${category}`,
    ),
  );
  const priceUrls = MICROSOFT_STORE_PRICE_FILTERS.flatMap((price) =>
    MICROSOFT_STORE_PLATFORMS.map(
      (platform) =>
        `https://www.microsoft.com/es-ar/store/top-paid/games/${platform}?price=${price}`,
    ),
  );

  return [...xboxUrls, ...collectionUrls, ...categoryUrls, ...priceUrls];
}

function getMicrosoftStoreMaxPages(): number {
  const parsed = Number(process.env.XBOX_DEALS_MAX_PAGES);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MICROSOFT_STORE_MAX_PAGES;
  }

  return Math.min(Math.floor(parsed), 20);
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    const index = nextIndex;
    nextIndex += 1;

    if (index >= items.length) {
      return;
    }

    try {
      results[index] = {
        status: "fulfilled",
        value: await worker(items[index]),
      };
    } catch (reason) {
      results[index] = {
        status: "rejected",
        reason,
      };
    }

    await runNext();
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()),
  );

  return results;
}

function getDiscountPercent(
  currentPrice: number,
  originalPrice?: number,
): number | undefined {
  if (!originalPrice || originalPrice <= currentPrice) {
    return undefined;
  }

  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
}

function extractJsonArrayAfterMarker<T>(html: string, marker: string): T[] {
  const jsonText = extractJsonAfterMarker(html, marker, "[", "]");
  return jsonText ? (JSON.parse(jsonText) as T[]) : [];
}

function extractJsonObjectAfterMarker<T>(html: string, marker: string): T {
  const jsonText = extractJsonAfterMarker(html, marker, "{", "}");
  return jsonText ? (JSON.parse(jsonText) as T) : ({} as T);
}

function extractJsonAfterMarker(
  html: string,
  marker: string,
  openChar: "{" | "[",
  closeChar: "}" | "]",
): string | undefined {
  const markerIndex = html.indexOf(marker);

  if (markerIndex < 0) {
    return undefined;
  }

  const start = html.indexOf(openChar, markerIndex + marker.length - 1);

  if (start < 0) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;

      if (depth === 0) {
        return html.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function extractXboxBrowseProductIds(html: string): string[] {
  const channelData = extractJsonObjectAfterMarker<
    Record<string, { data?: { products?: Array<{ productId?: string }> } }>
  >(html, '"channelData":');
  const productIds = Object.values(channelData).flatMap((channel) =>
    (channel.data?.products ?? [])
      .map((product) => product.productId?.toUpperCase())
      .filter((productId): productId is string => Boolean(productId)),
  );

  return [...new Set(productIds)];
}

function sourceHasGamePassFilter(html: string): boolean {
  return (
    html.includes("INCLUDEDINSUBSCRIPTION=GAMEPASS") ||
    html.includes("INCLUDEDINSUBSCRIPTION=PCGAMEPASS")
  );
}

function mapCategories(product?: CatalogProduct): GameCategory[] {
  const rawCategories = [
    product?.Properties?.Category,
    ...(product?.Properties?.Categories ?? []),
  ]
    .filter((category): category is string => Boolean(category))
    .map((category) => category.toLowerCase());
  const mapped = new Set<GameCategory>();

  rawCategories.forEach((category) => {
    if (category.includes("action")) mapped.add("action");
    if (category.includes("adventure")) mapped.add("adventure");
    if (category.includes("role")) mapped.add("rpg");
    if (category.includes("shooter")) mapped.add("shooter");
    if (category.includes("sport")) mapped.add("sports");
    if (category.includes("racing")) mapped.add("racing");
    if (category.includes("strategy")) mapped.add("strategy");
    if (category.includes("simulation")) mapped.add("simulation");
    if (category.includes("horror")) mapped.add("horror");
    if (category.includes("platform")) mapped.add("platformer");
    if (category.includes("fighting")) mapped.add("fighting");
    if (category.includes("puzzle")) mapped.add("puzzle");
    if (category.includes("indie")) mapped.add("indie");
    if (category.includes("family")) mapped.add("family");
  });

  return mapped.size > 0 ? [...mapped] : ["unknown"];
}

function mapModes(product?: CatalogProduct): GameMode[] {
  const attributes = product?.Properties?.Attributes ?? [];
  const names = attributes.map((attribute) => attribute.Name?.toLowerCase() ?? "");
  const mapped = new Set<GameMode>();

  names.forEach((name) => {
    if (name.includes("singleplayer")) mapped.add("single-player");
    if (name.includes("localcoop")) mapped.add("local-coop");
    if (name.includes("onlinecoop")) mapped.add("online-coop");
    if (name.includes("localmultiplayer")) mapped.add("local-multiplayer");
    if (name.includes("onlinemultiplayer")) mapped.add("online-multiplayer");
    if (name.includes("crossplatform")) mapped.add("cross-platform");
  });

  return mapped.size > 0 ? [...mapped] : ["unknown"];
}

function detectPlatform(product?: CatalogProduct, fallback?: Platform): Platform {
  const attributes = product?.Properties?.Attributes ?? [];
  const attributeNames = attributes.map((attribute) => attribute.Name?.toLowerCase());
  const platforms = new Set(
    attributes.flatMap((attribute) => attribute.ApplicablePlatforms ?? []),
  );
  const hasDesktop = platforms.has("Desktop");
  const hasXbox = platforms.has("Xbox");
  const hasPlayAnywhere =
    attributeNames.includes("xpa") || Boolean(product?.Properties?.XboxXPA);

  if (hasPlayAnywhere || (hasDesktop && hasXbox)) {
    return "play-anywhere";
  }

  if (hasDesktop && !hasXbox) {
    return "pc";
  }

  return fallback ?? "xbox";
}

function pickProductImage(product?: CatalogProduct): string | undefined {
  const images = product?.LocalizedProperties?.[0]?.Images ?? [];
  const preferred =
    images.find((image) => image.ImagePurpose === "TitledHeroArt") ??
    images.find((image) => image.ImagePurpose === "SuperHeroArt") ??
    images.find((image) => image.ImagePurpose === "BoxArt") ??
    images[0];

  return normalizeImageUrl(preferred?.Uri);
}

function normalizeImageUrl(uri?: string): string | undefined {
  if (!uri) {
    return undefined;
  }

  if (uri.startsWith("//")) {
    return `https:${uri}`;
  }

  return uri;
}

function normalizeTitle(
  catalogTitle?: string,
  fallbackTitle?: string,
): string | undefined {
  const preferred =
    catalogTitle && !hasBrokenSpanishCharacters(catalogTitle)
      ? catalogTitle
      : fallbackTitle && !hasBrokenSpanishCharacters(fallbackTitle)
        ? fallbackTitle
        : catalogTitle ?? fallbackTitle;

  return preferred ? repairCommonSpanishMojibake(preferred) : undefined;
}

function hasBrokenSpanishCharacters(value: string): boolean {
  return /[a-zA-Z]\?[a-zA-Z]/.test(value);
}

function repairCommonSpanishMojibake(value: string): string {
  return value
    .replace(/colecci\?n/g, "colección")
    .replace(/Colecci\?n/g, "Colección")
    .replace(/edici\?n/g, "edición")
    .replace(/Edici\?n/g, "Edición")
    .replace(/definit\?va/g, "definitiva")
    .replace(/Definit\?va/g, "Definitiva")
    .replace(/a\?o/g, "año")
    .replace(/A\?o/g, "Año")
    .replace(/b\?veda/g, "bóveda")
    .replace(/B\?veda/g, "Bóveda")
    .replace(/m\?s/g, "más")
    .replace(/M\?s/g, "Más");
}

function buildXboxStoreUrl(title: string, productId: string): string {
  return `https://www.xbox.com/es-AR/games/store/${slugify(title)}/${productId}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
