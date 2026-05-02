import type { Deal, ExternalStorePrice } from "./types";

type CurrentDealRow = {
  product_id: string;
  title: string;
  store_url: string;
  image_url: string | null;
  first_detected_at?: string;
  last_seen_at?: string;
  current_price: number;
  original_price: number | null;
  discount_percent: number | null;
  currency: "ARS";
  platform: Deal["platform"];
  is_game_pass: boolean;
  content_type: Deal["contentType"];
  categories: Deal["categories"];
  modes: Deal["modes"];
  lowest_price: number | null;
  lowest_price_at: string | null;
  raw?: Partial<Deal>;
};

type PreviousHistoryRow = {
  product_id: string;
  current_price: number;
  original_price: number | null;
  discount_percent: number | null;
  detected_at: string;
};

type CatalogProductStatusRow = {
  product_id: string;
  platform: Deal["platform"];
  content_type: Deal["contentType"];
  last_seen_at: string;
};

type ExternalPriceRow = {
  product_id: string;
  store: "steam";
  current_price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  currency: string;
  external_url: string | null;
  fetched_at: string;
};

type ExternalMatchRow = {
  product_id: string;
  store: "steam";
  external_id: string | null;
  external_type: string | null;
  external_url: string | null;
  matched_title: string | null;
  match_confidence: number | null;
  updated_at?: string;
};

export type ExternalPricePersistInput = {
  productId: string;
  price: ExternalStorePrice;
  raw?: unknown;
};

export type ExternalStoreMissInput = {
  productId: string;
  store: "steam";
  fetchedAt: string;
};

type PersistResult = {
  configured: boolean;
  discoveredProducts: number;
  previouslyTrackedProducts: number;
  catalogUpserted: number;
  upserted: number;
  priceHistoryInserted: number;
  priceChanges: number;
  newDeals: number;
  historyBackfilled: number;
};

export type CatalogStatus = {
  configured: boolean;
  catalogProducts: number;
  trackedPrices: number;
  priceHistoryRows: number;
  alertEvents: number;
  coveragePercent: number;
  lastCatalogSeenAt?: string;
  lastPriceSeenAt?: string;
  byPlatform: Record<Deal["platform"], number>;
  byContentType: Record<Deal["contentType"], number>;
};

export type SteamCoverageEntry = {
  productId: string;
  externalId?: string;
  externalType?: string;
  externalUrl?: string;
  matchedTitle?: string;
  matchConfidence: number;
  matchedAt?: string;
  priceFetchedAt?: string;
};

export type AlertEventInput = {
  productId: string;
  alertType: string;
  dealSnapshot: unknown;
  sentTo?: string;
};

const REST_PATH_SUFFIX = "/rest/v1";
const CURRENT_DEALS_CACHE_TTL_MS = 5 * 60 * 1000;

let currentDealsCache:
  | {
      fetchedAt: number;
      deals: Deal[];
    }
  | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseBaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function persistDealsToSupabase(
  deals: Deal[],
): Promise<PersistResult> {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      discoveredProducts: deals.length,
      previouslyTrackedProducts: 0,
      catalogUpserted: 0,
      upserted: 0,
      priceHistoryInserted: 0,
      priceChanges: 0,
      newDeals: 0,
      historyBackfilled: 0,
    };
  }

  const now = new Date().toISOString();
  const productIds = deals.map((deal) => deal.id);
  const existingRows = await fetchCurrentDealRows(productIds);
  const previousRows = await fetchPreviousHistoryRows(productIds);
  const existingById = new Map(
    existingRows.map((row) => [row.product_id, row]),
  );
  const previousById = new Map(
    previousRows.map((row) => [row.product_id, row]),
  );
  const currentRows = deals.map((deal) =>
    toCurrentDealRow(deal, now, existingById.get(deal.id)),
  );
  const catalogRows = deals.map((deal) => toCatalogProductRow(deal, now));
  const historyCandidates = deals
    .map((deal) => ({
      deal,
      existing: existingById.get(deal.id),
      previous: previousById.get(deal.id),
    }))
    .filter(({ deal, existing, previous }) =>
      shouldInsertHistory(deal, existing, previous),
    );
  const historyRows = historyCandidates.map(({ deal, previous }) => ({
    product_id: deal.id,
    current_price: deal.currentPrice,
    original_price: deal.originalPrice ?? null,
    discount_percent: deal.discountPercent ?? null,
    detected_at: now,
    source: previous ? "refresh" : "baseline",
  }));

  let catalogUpserted = 0;

  try {
    await postgrestRequest("catalog_products?on_conflict=product_id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: catalogRows,
    });
    catalogUpserted = catalogRows.length;
  } catch (error) {
    console.warn(
      "No se pudo guardar catalog_products. Ejecuta supabase/schema.sql actualizado.",
      error,
    );
  }

  await postgrestRequest("deals_current?on_conflict=product_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: currentRows,
  });

  for (const chunk of chunkArray(historyRows, 500)) {
    if (chunk.length === 0) {
      continue;
    }

    await postgrestRequest("price_history", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: chunk,
    });
  }

  currentDealsCache = undefined;

  return {
    configured: true,
    discoveredProducts: deals.length,
    previouslyTrackedProducts: existingRows.length,
    catalogUpserted,
    upserted: currentRows.length,
    priceHistoryInserted: historyRows.length,
    priceChanges: historyCandidates.filter(
      ({ existing, previous }) => existing && previous,
    ).length,
    newDeals: historyCandidates.filter(({ existing }) => !existing).length,
    historyBackfilled: historyCandidates.filter(
      ({ existing, previous }) => existing && !previous,
    ).length,
  };
}

export async function fetchTrackedDealsFromSupabase(): Promise<Deal[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const currentRows = await fetchAllCurrentDealRows();
  const previousRows = await fetchPreviousHistoryRows(
    currentRows.map((row) => row.product_id),
  );
  const externalRows = await fetchExternalPriceRows(
    currentRows.map((row) => row.product_id),
  );
  const externalMatches = await fetchExternalMatchRows(
    currentRows.map((row) => row.product_id),
  );
  const previousById = new Map(
    previousRows.map((row) => [row.product_id, row]),
  );
  const externalById = groupExternalPricesByProductId(
    externalRows,
    externalMatches,
  );

  return currentRows
    .map((row) =>
      mapCurrentRowToDeal(
        row,
        previousById.get(row.product_id),
        externalById.get(row.product_id) ?? [],
      ),
    )
    .sort((a, b) => a.currentPrice - b.currentPrice);
}

export async function fetchCurrentDealsFromSupabase(): Promise<Deal[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  if (
    currentDealsCache &&
    Date.now() - currentDealsCache.fetchedAt < CURRENT_DEALS_CACHE_TTL_MS
  ) {
    return currentDealsCache.deals;
  }

  const currentRows = await fetchAllCurrentDealRows();

  const deals = currentRows
    .map((row) => mapCurrentRowToDeal(row))
    .sort((a, b) => a.currentPrice - b.currentPrice);

  currentDealsCache = {
    fetchedAt: Date.now(),
    deals,
  };

  return deals;
}

export async function enrichDealsWithStoredMetadata(deals: Deal[]): Promise<Deal[]> {
  if (!isSupabaseConfigured() || deals.length === 0) {
    return deals;
  }

  const productIds = deals.map((deal) => deal.id);
  const [currentRows, previousRows, externalRows, externalMatches] =
    await Promise.all([
      fetchCurrentDealRows(productIds),
      fetchPreviousHistoryRows(productIds),
      fetchExternalPriceRows(productIds),
      fetchExternalMatchRows(productIds),
    ]);
  const currentById = new Map(
    currentRows.map((row) => [row.product_id, row]),
  );
  const previousById = new Map(
    previousRows.map((row) => [row.product_id, row]),
  );
  const externalById = groupExternalPricesByProductId(
    externalRows,
    externalMatches,
  );

  return deals.map((deal) => {
    const current = currentById.get(deal.id);
    const previous = previousById.get(deal.id);
    const externalPrices = externalById.get(deal.id) ?? [];

    if (!current) {
      return {
        ...deal,
        externalPrices,
      };
    }

    return mapCurrentRowToDeal(current, previous, externalPrices);
  });
}

export async function persistExternalStorePrices(
  entries: ExternalPricePersistInput[],
): Promise<{ configured: boolean; upserted: number; historyInserted: number }> {
  if (!isSupabaseConfigured() || entries.length === 0) {
    return { configured: isSupabaseConfigured(), upserted: 0, historyInserted: 0 };
  }

  const existingRows = await fetchExternalPriceRows(
    entries.map((entry) => entry.productId),
  );
  const existingByKey = new Map(
    existingRows.map((row) => [`${row.product_id}:${row.store}`, row]),
  );
  const matchRows = entries.map((entry) => ({
    product_id: entry.productId,
    store: entry.price.store,
    external_id: entry.price.externalId,
    external_type: entry.price.externalType ?? null,
    external_url: entry.price.url,
    matched_title: entry.price.title,
    match_confidence: entry.price.matchConfidence,
    matched_at: entry.price.fetchedAt,
    updated_at: entry.price.fetchedAt,
  }));
  const priceRows = entries.map((entry) => ({
    product_id: entry.productId,
    store: entry.price.store,
    current_price: entry.price.currentPrice ?? null,
    original_price: entry.price.originalPrice ?? null,
    discount_percent: entry.price.discountPercent ?? null,
    currency: entry.price.currency,
    external_url: entry.price.url,
    fetched_at: entry.price.fetchedAt,
    raw: entry.raw ?? {},
  }));
  const historyRows = priceRows.filter((row) =>
    shouldInsertExternalHistory(row, existingByKey.get(`${row.product_id}:${row.store}`)),
  );

  await postgrestRequest("external_store_matches?on_conflict=product_id,store", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: matchRows,
  });
  await postgrestRequest("external_prices_current?on_conflict=product_id,store", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: priceRows,
  });

  for (const chunk of chunkArray(historyRows, 500)) {
    if (chunk.length === 0) {
      continue;
    }

    await postgrestRequest("external_price_history", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: chunk.map((row) => ({
        product_id: row.product_id,
        store: row.store,
        current_price: row.current_price,
        original_price: row.original_price,
        discount_percent: row.discount_percent,
        currency: row.currency,
        fetched_at: row.fetched_at,
        raw: row.raw,
        source: "steam-refresh",
      })),
    });
  }

  return {
    configured: true,
    upserted: priceRows.length,
    historyInserted: historyRows.length,
  };
}

export async function persistExternalStoreMisses(
  entries: ExternalStoreMissInput[],
): Promise<{ configured: boolean; upserted: number }> {
  if (!isSupabaseConfigured() || entries.length === 0) {
    return { configured: isSupabaseConfigured(), upserted: 0 };
  }

  await postgrestRequest("external_store_matches?on_conflict=product_id,store", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: entries.map((entry) => ({
      product_id: entry.productId,
      store: entry.store,
      external_id: null,
      external_type: null,
      external_url: null,
      matched_title: null,
      match_confidence: 0,
      matched_at: entry.fetchedAt,
      updated_at: entry.fetchedAt,
    })),
  });

  return {
    configured: true,
    upserted: entries.length,
  };
}

export async function fetchSteamMatchedProductIds(): Promise<Set<string>> {
  if (!isSupabaseConfigured()) {
    return new Set();
  }

  try {
    const rows: Array<{ product_id: string }> = [];
    const pageSize = 1000;

    for (let offset = 0; ; offset += pageSize) {
      const query = new URLSearchParams({
        select: "product_id",
        store: "eq.steam",
        limit: String(pageSize),
        offset: String(offset),
      });
      const chunk = await postgrestRequest<Array<{ product_id: string }>>(
        `external_store_matches?${query.toString()}`,
        {
          method: "GET",
        },
      );

      rows.push(...chunk);

      if (chunk.length < pageSize) {
        break;
      }
    }

    return new Set(rows.map((row) => row.product_id));
  } catch {
    return new Set();
  }
}

export async function fetchSteamCoverageFromSupabase(): Promise<
  Map<string, SteamCoverageEntry>
> {
  if (!isSupabaseConfigured()) {
    return new Map();
  }

  try {
    const [matches, prices] = await Promise.all([
      fetchAllExternalMatchRows("steam"),
      fetchAllExternalPriceRows("steam"),
    ]);
    const priceFetchedAtByProductId = new Map(
      prices.map((row) => [row.product_id, row.fetched_at]),
    );

    return new Map(
      matches.map((match) => [
        match.product_id,
        {
          productId: match.product_id,
          externalId: match.external_id ?? undefined,
          externalType: match.external_type ?? undefined,
          externalUrl: match.external_url ?? undefined,
          matchedTitle: match.matched_title ?? undefined,
          matchConfidence: match.match_confidence ?? 0,
          matchedAt: match.updated_at,
          priceFetchedAt: priceFetchedAtByProductId.get(match.product_id),
        },
      ]),
    );
  } catch {
    return new Map();
  }
}

export async function fetchCatalogStatusFromSupabase(): Promise<CatalogStatus> {
  const emptyStatus = getEmptyCatalogStatus();

  if (!isSupabaseConfigured()) {
    return emptyStatus;
  }

  try {
    const [catalogRows, currentRows, priceHistoryRows, alertEvents] =
      await Promise.all([
        fetchAllCatalogProductStatusRows(),
        fetchAllCurrentDealRows(),
        postgrestCount("price_history"),
        postgrestCount("alert_events"),
      ]);
    const byPlatform = countBy(catalogRows, "platform", getEmptyPlatformCounts());
    const byContentType = countBy(
      catalogRows,
      "content_type",
      getEmptyContentTypeCounts(),
    );

    return {
      configured: true,
      catalogProducts: catalogRows.length,
      trackedPrices: currentRows.length,
      priceHistoryRows,
      alertEvents,
      coveragePercent:
        catalogRows.length > 0
          ? Math.round((currentRows.length / catalogRows.length) * 100)
          : 0,
      lastCatalogSeenAt: getLatestDate(catalogRows.map((row) => row.last_seen_at)),
      lastPriceSeenAt: getLatestDate(
        currentRows
          .map((row) => row.last_seen_at)
          .filter((value): value is string => Boolean(value)),
      ),
      byPlatform,
      byContentType,
    };
  } catch (error) {
    console.error("No se pudo obtener el estado del catalogo.", error);
    return emptyStatus;
  }
}

export async function fetchRecentAlertProductIds(
  alertType: string,
  since: string,
): Promise<Set<string>> {
  if (!isSupabaseConfigured()) {
    return new Set();
  }

  try {
    const query = new URLSearchParams({
      select: "product_id",
      alert_type: `eq.${alertType}`,
      sent_at: `gte.${since}`,
      limit: "1000",
    });
    const rows = await postgrestRequest<Array<{ product_id: string }>>(
      `alert_events?${query.toString()}`,
      {
        method: "GET",
      },
    );

    return new Set(rows.map((row) => row.product_id));
  } catch {
    return new Set();
  }
}

export async function persistAlertEvents(
  entries: AlertEventInput[],
): Promise<{ configured: boolean; inserted: number }> {
  if (!isSupabaseConfigured() || entries.length === 0) {
    return { configured: isSupabaseConfigured(), inserted: 0 };
  }

  await postgrestRequest("alert_events", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: entries.map((entry) => ({
      product_id: entry.productId,
      alert_type: entry.alertType,
      deal_snapshot: entry.dealSnapshot,
      sent_to: entry.sentTo ?? null,
    })),
  });

  return {
    configured: true,
    inserted: entries.length,
  };
}

export async function enrichDealsWithHistory(deals: Deal[]): Promise<Deal[]> {
  if (!isSupabaseConfigured() || deals.length === 0) {
    return deals;
  }

  try {
    const currentRows = await fetchCurrentDealRows(deals.map((deal) => deal.id));
    const previousRows = await fetchPreviousHistoryRows(deals.map((deal) => deal.id));
    const currentById = new Map(
      currentRows.map((row) => [row.product_id, row]),
    );
    const previousById = new Map(
      previousRows.map((row) => [row.product_id, row]),
    );

    return deals.map((deal) => {
      const current = currentById.get(deal.id);
      const previous = previousById.get(deal.id);
      const previousPrice = previous?.current_price;
      const lowestPrice = current?.lowest_price ?? undefined;

      return {
        ...deal,
        firstDetectedAt: current?.first_detected_at,
        lastSeenAt: current?.last_seen_at,
        lowestPrice,
        lowestPriceAt: current?.lowest_price_at ?? undefined,
        previousPrice,
        priceChange: getPriceChange(deal.currentPrice, previousPrice, current),
        isHistoricalLow:
          lowestPrice !== undefined ? deal.currentPrice <= Number(lowestPrice) : false,
      };
    });
  } catch (error) {
    console.error("No se pudo enriquecer con historico de Supabase.", error);
    return deals;
  }
}

async function fetchCurrentDealRows(productIds: string[]): Promise<CurrentDealRow[]> {
  const rows: CurrentDealRow[] = [];

  for (const ids of chunkArray([...new Set(productIds)], 100)) {
    if (ids.length === 0) {
      continue;
    }

    const encodedIds = ids
      .map((id) => `"${id.replaceAll('"', '\\"')}"`)
      .join(",");
    const query = new URLSearchParams({
      select: getCurrentDealSelect(),
      product_id: `in.(${encodedIds})`,
    });

    const chunk = await postgrestRequest<CurrentDealRow[]>(
      `deals_current?${query.toString()}`,
      {
        method: "GET",
      },
    );
    rows.push(...chunk);
  }

  return rows;
}

async function fetchAllCurrentDealRows(): Promise<CurrentDealRow[]> {
  const rows: CurrentDealRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({
      select: getCurrentDealSelect(),
      order: "current_price.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const chunk = await postgrestRequest<CurrentDealRow[]>(
      `deals_current?${query.toString()}`,
      {
        method: "GET",
      },
    );

    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function fetchAllCatalogProductStatusRows(): Promise<CatalogProductStatusRow[]> {
  const rows: CatalogProductStatusRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({
      select: "product_id,platform,content_type,last_seen_at",
      order: "last_seen_at.desc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const chunk = await postgrestRequest<CatalogProductStatusRow[]>(
      `catalog_products?${query.toString()}`,
      {
        method: "GET",
      },
    );

    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function fetchPreviousHistoryRows(
  productIds: string[],
): Promise<PreviousHistoryRow[]> {
  const rows: PreviousHistoryRow[] = [];

  for (const ids of chunkArray([...new Set(productIds)], 100)) {
    if (ids.length === 0) {
      continue;
    }

    const encodedIds = ids
      .map((id) => `"${id.replaceAll('"', '\\"')}"`)
      .join(",");
    const query = new URLSearchParams({
      select: "product_id,current_price,original_price,discount_percent,detected_at",
      product_id: `in.(${encodedIds})`,
      order: "detected_at.desc",
    });

    const chunk = await postgrestRequest<PreviousHistoryRow[]>(
      `price_history?${query.toString()}`,
      {
        method: "GET",
      },
    );
    const seen = new Set(rows.map((row) => row.product_id));

    chunk.forEach((row) => {
      if (!seen.has(row.product_id)) {
        rows.push(row);
        seen.add(row.product_id);
      }
    });
  }

  return rows;
}

async function fetchExternalPriceRows(
  productIds: string[],
): Promise<ExternalPriceRow[]> {
  const rows: ExternalPriceRow[] = [];

  for (const ids of chunkArray([...new Set(productIds)], 100)) {
    if (ids.length === 0) {
      continue;
    }

    const encodedIds = ids
      .map((id) => `"${id.replaceAll('"', '\\"')}"`)
      .join(",");
    const query = new URLSearchParams({
      select:
        "product_id,store,current_price,original_price,discount_percent,currency,external_url,fetched_at",
      product_id: `in.(${encodedIds})`,
      store: "eq.steam",
    });

    try {
      const chunk = await postgrestRequest<ExternalPriceRow[]>(
        `external_prices_current?${query.toString()}`,
        {
          method: "GET",
        },
      );
      rows.push(...chunk);
    } catch (error) {
      console.warn(
        "No se pudieron leer precios externos. Ejecuta supabase/schema.sql actualizado.",
        error,
      );
      return [];
    }
  }

  return rows;
}

async function fetchAllExternalPriceRows(
  store: "steam",
): Promise<ExternalPriceRow[]> {
  const rows: ExternalPriceRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({
      select:
        "product_id,store,current_price,original_price,discount_percent,currency,external_url,fetched_at",
      store: `eq.${store}`,
      limit: String(pageSize),
      offset: String(offset),
    });

    const chunk = await postgrestRequest<ExternalPriceRow[]>(
      `external_prices_current?${query.toString()}`,
      {
        method: "GET",
      },
    );
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function fetchExternalMatchRows(
  productIds: string[],
): Promise<ExternalMatchRow[]> {
  const rows: ExternalMatchRow[] = [];

  for (const ids of chunkArray([...new Set(productIds)], 100)) {
    if (ids.length === 0) {
      continue;
    }

    const encodedIds = ids
      .map((id) => `"${id.replaceAll('"', '\\"')}"`)
      .join(",");
    const query = new URLSearchParams({
      select:
        "product_id,store,external_id,external_type,external_url,matched_title,match_confidence",
      product_id: `in.(${encodedIds})`,
      store: "eq.steam",
    });

    try {
      const chunk = await postgrestRequest<ExternalMatchRow[]>(
        `external_store_matches?${query.toString()}`,
        {
          method: "GET",
        },
      );
      rows.push(...chunk);
    } catch {
      return [];
    }
  }

  return rows;
}

async function fetchAllExternalMatchRows(
  store: "steam",
): Promise<ExternalMatchRow[]> {
  const rows: ExternalMatchRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({
      select:
        "product_id,store,external_id,external_type,external_url,matched_title,match_confidence,updated_at",
      store: `eq.${store}`,
      limit: String(pageSize),
      offset: String(offset),
    });

    const chunk = await postgrestRequest<ExternalMatchRow[]>(
      `external_store_matches?${query.toString()}`,
      {
        method: "GET",
      },
    );
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }
  }

  return rows;
}

function toCurrentDealRow(
  deal: Deal,
  now: string,
  existing?: CurrentDealRow,
) {
  const existingLowestPrice = existing?.lowest_price ?? undefined;
  const isNewLowest =
    existingLowestPrice === undefined || deal.currentPrice < existingLowestPrice;
  const lowestPrice = isNewLowest ? deal.currentPrice : existingLowestPrice;
  const lowestPriceAt = isNewLowest ? now : existing?.lowest_price_at ?? now;

  return {
    product_id: deal.id,
    title: deal.title,
    store_url: deal.storeUrl,
    image_url: deal.imageUrl ?? null,
    current_price: deal.currentPrice,
    original_price: deal.originalPrice ?? null,
    discount_percent: deal.discountPercent ?? null,
    currency: deal.currency,
    platform: deal.platform,
    is_game_pass: deal.isGamePass,
    content_type: deal.contentType,
    categories: deal.categories,
    modes: deal.modes,
    last_seen_at: now,
    lowest_price: lowestPrice,
    lowest_price_at: lowestPriceAt,
    raw: deal,
    updated_at: now,
  };
}

function toCatalogProductRow(deal: Deal, now: string) {
  return {
    product_id: deal.id,
    title: deal.title,
    store_url: deal.storeUrl,
    image_url: deal.imageUrl ?? null,
    platform: deal.platform,
    is_game_pass: deal.isGamePass,
    content_type: deal.contentType,
    categories: deal.categories,
    modes: deal.modes,
    last_seen_at: now,
    raw: deal,
    updated_at: now,
  };
}

function mapCurrentRowToDeal(
  row: CurrentDealRow,
  previous?: PreviousHistoryRow,
  externalPrices: ExternalStorePrice[] = [],
): Deal {
  const currentPrice = Number(row.current_price);
  const previousPrice = previous ? Number(previous.current_price) : undefined;
  const lowestPrice =
    row.lowest_price !== null && row.lowest_price !== undefined
      ? Number(row.lowest_price)
      : undefined;

  return {
    id: row.product_id,
    productId: row.product_id,
    title: row.title,
    imageUrl: row.image_url ?? undefined,
    storeUrl: row.store_url,
    currentPrice,
    originalPrice:
      row.original_price !== null && row.original_price !== undefined
        ? Number(row.original_price)
        : undefined,
    discountPercent:
      row.discount_percent !== null && row.discount_percent !== undefined
        ? Number(row.discount_percent)
        : undefined,
    currency: row.currency,
    platform: row.platform,
    isGamePass: row.is_game_pass,
    contentType: row.content_type,
    categories: row.categories,
    modes: row.modes,
    detectedAt: row.last_seen_at ?? new Date().toISOString(),
    firstDetectedAt: row.first_detected_at,
    lastSeenAt: row.last_seen_at,
    lowestPrice,
    lowestPriceAt: row.lowest_price_at ?? undefined,
    previousPrice,
    priceChange: getPriceChange(currentPrice, previousPrice, row),
    isHistoricalLow: lowestPrice !== undefined ? currentPrice <= lowestPrice : false,
    externalPrices,
  };
}

function getCurrentDealSelect(): string {
  return [
    "product_id",
    "title",
    "store_url",
    "image_url",
    "first_detected_at",
    "last_seen_at",
    "current_price",
    "original_price",
    "discount_percent",
    "currency",
    "platform",
    "is_game_pass",
    "content_type",
    "categories",
    "modes",
    "lowest_price",
    "lowest_price_at",
  ].join(",");
}

function shouldInsertHistory(
  deal: Deal,
  existing?: CurrentDealRow,
  previous?: PreviousHistoryRow,
): boolean {
  if (!existing) {
    return true;
  }

  if (!previous) {
    return true;
  }

  return (
    Number(previous.current_price) !== deal.currentPrice ||
    nullableNumber(previous.original_price) !== nullableNumber(deal.originalPrice) ||
    nullableNumber(previous.discount_percent) !==
      nullableNumber(deal.discountPercent)
  );
}

function shouldInsertExternalHistory(
  next: {
    current_price: number | null;
    original_price: number | null;
    discount_percent: number | null;
  },
  previous?: ExternalPriceRow,
): boolean {
  if (!previous) {
    return true;
  }

  return (
    nullableNumber(previous.current_price) !== nullableNumber(next.current_price) ||
    nullableNumber(previous.original_price) !== nullableNumber(next.original_price) ||
    nullableNumber(previous.discount_percent) !==
      nullableNumber(next.discount_percent)
  );
}

async function postgrestRequest<T = unknown>(
  path: string,
  options: {
    method: "GET" | "POST";
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<T> {
  const response = await postgrestFetch(path, options);
  const text = await response.text();

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

async function postgrestCount(table: string): Promise<number> {
  const response = await postgrestFetch(`${table}?select=product_id`, {
    method: "GET",
    headers: {
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  const contentRange = response.headers.get("content-range");

  if (!contentRange) {
    return 0;
  }

  const [, count] = contentRange.split("/");
  const parsed = Number(count);

  return Number.isFinite(parsed) ? parsed : 0;
}

async function postgrestFetch(
  path: string,
  options: {
    method: "GET" | "POST";
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<Response> {
  const baseUrl = getSupabaseBaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !serviceKey) {
    throw new Error("Supabase no esta configurado.");
  }

  const response = await fetch(`${baseUrl}${REST_PATH_SUFFIX}/${path}`, {
    method: options.method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase respondio ${response.status}: ${body}`);
  }

  return response;
}

function getSupabaseBaseUrl(): string | undefined {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!rawUrl) {
    return undefined;
  }

  return rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

function nullableNumber(value?: number | null): number | null {
  return value === undefined ? null : value;
}

function groupExternalPricesByProductId(
  rows: ExternalPriceRow[],
  matches: ExternalMatchRow[],
): Map<string, ExternalStorePrice[]> {
  const grouped = new Map<string, ExternalStorePrice[]>();
  const matchByKey = new Map(
    matches.map((match) => [`${match.product_id}:${match.store}`, match]),
  );

  rows.forEach((row) => {
    const match = matchByKey.get(`${row.product_id}:${row.store}`);
    const price: ExternalStorePrice = {
      store: row.store,
      externalId: match?.external_id ?? "",
      externalType: match?.external_type ?? undefined,
      title: match?.matched_title ?? "Steam",
      url: row.external_url ?? "",
      currentPrice:
        row.current_price !== null && row.current_price !== undefined
          ? Number(row.current_price)
          : undefined,
      originalPrice:
        row.original_price !== null && row.original_price !== undefined
          ? Number(row.original_price)
          : undefined,
      discountPercent:
        row.discount_percent !== null && row.discount_percent !== undefined
          ? Number(row.discount_percent)
          : undefined,
      currency: row.currency,
      matchConfidence: match?.match_confidence ?? 0,
      fetchedAt: row.fetched_at,
    };

    grouped.set(row.product_id, [...(grouped.get(row.product_id) ?? []), price]);
  });

  return grouped;
}

function getEmptyCatalogStatus(): CatalogStatus {
  return {
    configured: false,
    catalogProducts: 0,
    trackedPrices: 0,
    priceHistoryRows: 0,
    alertEvents: 0,
    coveragePercent: 0,
    byPlatform: getEmptyPlatformCounts(),
    byContentType: getEmptyContentTypeCounts(),
  };
}

function getEmptyPlatformCounts(): Record<Deal["platform"], number> {
  return {
    xbox: 0,
    pc: 0,
    "play-anywhere": 0,
    unknown: 0,
  };
}

function getEmptyContentTypeCounts(): Record<Deal["contentType"], number> {
  return {
    "base-game": 0,
    bundle: 0,
    edition: 0,
    "add-on": 0,
    unknown: 0,
  };
}

function countBy<T extends Record<string, string>, K extends keyof T>(
  rows: T[],
  key: K,
  initial: Record<T[K], number>,
): Record<T[K], number> {
  return rows.reduce((counts, row) => {
    counts[row[key]] = (counts[row[key]] ?? 0) + 1;
    return counts;
  }, initial);
}

function getLatestDate(values: string[]): string | undefined {
  const latest = values
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  return latest ? new Date(latest).toISOString() : undefined;
}

function getPriceChange(
  currentPrice: number,
  previousPrice?: number,
  current?: CurrentDealRow,
): Deal["priceChange"] {
  if (!current) {
    return "unknown";
  }

  if (isRecentlyFirstSeen(current)) {
    return "new";
  }

  if (previousPrice === undefined) {
    return "unknown";
  }

  if (currentPrice < previousPrice) {
    return "down";
  }

  if (currentPrice > previousPrice) {
    return "up";
  }

  return "same";
}

function isRecentlyFirstSeen(current: CurrentDealRow): boolean {
  if (!current.first_detected_at || !current.last_seen_at) {
    return false;
  }

  const firstSeen = new Date(current.first_detected_at).getTime();
  const lastSeen = new Date(current.last_seen_at).getTime();

  if (!Number.isFinite(firstSeen) || !Number.isFinite(lastSeen)) {
    return false;
  }

  return Math.abs(lastSeen - firstSeen) <= 60_000;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
