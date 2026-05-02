import type { Deal, ExternalStorePrice } from "./types";

const STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch/";
const STEAM_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails";
const MIN_MATCH_CONFIDENCE = 72;
const STEAM_TIMEOUT_MS = 8_000;

type SteamSearchResponse = {
  items?: SteamSearchItem[];
};

type SteamSearchItem = {
  id: number;
  name: string;
  type: "app" | "sub" | string;
  price?: {
    currency: string;
    initial: number;
    final: number;
  } | null;
};

type SteamAppDetailsResponse = Record<
  string,
  {
    success: boolean;
    data?: {
      name?: string;
      steam_appid?: number;
      price_overview?: {
        currency: string;
        initial: number;
        final: number;
        discount_percent?: number;
      };
    };
  }
>;

export type SteamLookupResult = {
  productId: string;
  found: boolean;
  price?: ExternalStorePrice;
  raw?: unknown;
};

export type SteamKnownMatch = {
  externalId: string;
  externalType?: string | null;
  title?: string | null;
  url?: string | null;
  confidence?: number | null;
};

export async function lookupSteamPriceForDeal(
  deal: Deal,
): Promise<SteamLookupResult> {
  const candidates = await searchSteam(deal.title);
  const bestCandidate = pickBestSteamCandidate(deal.title, candidates);

  if (!bestCandidate || bestCandidate.confidence < MIN_MATCH_CONFIDENCE) {
    return {
      productId: deal.id,
      found: false,
      raw: { candidates: candidates.slice(0, 5) },
    };
  }

  const detailedCandidate =
    bestCandidate.item.type === "app" && !bestCandidate.item.price
      ? await fetchSteamAppDetails(bestCandidate.item)
      : bestCandidate.item;
  const price = detailedCandidate.price;

  return {
    productId: deal.id,
    found: true,
    price: {
      store: "steam",
      externalId: String(detailedCandidate.id),
      externalType: detailedCandidate.type,
      title: detailedCandidate.name,
      url: buildSteamUrl(detailedCandidate),
      currentPrice: price ? centsToAmount(price.final) : undefined,
      originalPrice: price ? centsToAmount(price.initial) : undefined,
      discountPercent: price
        ? getDiscountPercent(price.final, price.initial)
        : undefined,
      currency: price?.currency ?? "USD",
      matchConfidence: bestCandidate.confidence,
      fetchedAt: new Date().toISOString(),
    },
    raw: {
      candidate: bestCandidate.item,
      confidence: bestCandidate.confidence,
    },
  };
}

export async function lookupSteamPriceForKnownMatch(
  deal: Deal,
  match: SteamKnownMatch,
): Promise<SteamLookupResult> {
  if (!match.externalId) {
    return lookupSteamPriceForDeal(deal);
  }

  if (match.externalType === "sub") {
    return lookupSteamPriceForDeal({
      ...deal,
      title: match.title ?? deal.title,
    });
  }

  const item = await fetchSteamAppDetails({
    id: Number(match.externalId),
    name: match.title ?? deal.title,
    type: "app",
  });
  const price = item.price;

  return {
    productId: deal.id,
    found: true,
    price: {
      store: "steam",
      externalId: String(item.id),
      externalType: item.type,
      title: item.name,
      url: buildSteamUrl(item),
      currentPrice: price ? centsToAmount(price.final) : undefined,
      originalPrice: price ? centsToAmount(price.initial) : undefined,
      discountPercent: price
        ? getDiscountPercent(price.final, price.initial)
        : undefined,
      currency: price?.currency ?? "USD",
      matchConfidence: match.confidence ?? 100,
      fetchedAt: new Date().toISOString(),
    },
    raw: {
      source: "known-match",
      externalId: match.externalId,
      externalType: match.externalType ?? "app",
    },
  };
}

async function searchSteam(title: string): Promise<SteamSearchItem[]> {
  const url = new URL(STEAM_SEARCH_URL);
  url.searchParams.set("term", title);
  url.searchParams.set("cc", "ar");
  url.searchParams.set("l", "spanish");

  const response = await fetchWithTimeout(url, {
    headers: {
      "Accept-Language": "es-AR,es;q=0.9,en;q=0.7",
      "User-Agent": "xbox-deals-ar/0.1 (+personal price tracker)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Steam search respondio ${response.status}`);
  }

  const data = (await response.json()) as SteamSearchResponse;

  return data.items ?? [];
}

async function fetchSteamAppDetails(item: SteamSearchItem): Promise<SteamSearchItem> {
  const url = new URL(STEAM_APPDETAILS_URL);
  url.searchParams.set("appids", String(item.id));
  url.searchParams.set("cc", "ar");
  url.searchParams.set("l", "spanish");
  url.searchParams.set("filters", "basic,price_overview");

  const response = await fetchWithTimeout(url, {
    headers: {
      "Accept-Language": "es-AR,es;q=0.9,en;q=0.7",
      "User-Agent": "xbox-deals-ar/0.1 (+personal price tracker)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return item;
  }

  const data = (await response.json()) as SteamAppDetailsResponse;
  const app = data[String(item.id)]?.data;

  if (!app?.price_overview) {
    return item;
  }

  return {
    ...item,
    name: app.name ?? item.name,
    price: {
      currency: app.price_overview.currency,
      initial: app.price_overview.initial,
      final: app.price_overview.final,
    },
  };
}

async function fetchWithTimeout(
  url: URL,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STEAM_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function pickBestSteamCandidate(title: string, candidates: SteamSearchItem[]) {
  return candidates
    .map((item, index) => ({
      item,
      confidence: scoreTitleMatch(title, item.name) - index,
    }))
    .sort((a, b) => b.confidence - a.confidence)[0];
}

function scoreTitleMatch(sourceTitle: string, candidateTitle: string): number {
  const source = normalizeTitle(sourceTitle);
  const candidate = normalizeTitle(candidateTitle);

  if (!source || !candidate) {
    return 0;
  }

  if (source === candidate) {
    return 100;
  }

  if (stripEditionWords(source) === stripEditionWords(candidate)) {
    return 92;
  }

  if (candidate.includes(source) || source.includes(candidate)) {
    return 82;
  }

  const sourceTokens = tokenSet(source);
  const candidateTokens = tokenSet(candidate);
  const sharedTokens = [...sourceTokens].filter((token) =>
    candidateTokens.has(token),
  );
  const unionSize = new Set([...sourceTokens, ...candidateTokens]).size;

  return unionSize > 0 ? Math.round((sharedTokens.length / unionSize) * 100) : 0;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2122\u00ae\u00a9]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripEditionWords(value: string): string {
  return value
    .replace(/\b(ultimate|complete|deluxe|definitive|enhanced|edition|edicion|game of the year|goty)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
  );
}

function centsToAmount(value: number): number {
  return value / 100;
}

function getDiscountPercent(finalPrice: number, initialPrice: number): number {
  if (initialPrice <= finalPrice || initialPrice <= 0) {
    return 0;
  }

  return Math.round(((initialPrice - finalPrice) / initialPrice) * 100);
}

function buildSteamUrl(item: SteamSearchItem): string {
  const kind = item.type === "sub" ? "sub" : "app";

  return `https://store.steampowered.com/${kind}/${item.id}`;
}
