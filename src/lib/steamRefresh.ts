import { filterDeals, sortDeals } from "@/lib/dealFilters";
import {
  fetchCurrentDealsFromSupabase,
  fetchSteamCoverageFromSupabase,
  persistExternalStoreMisses,
  persistExternalStorePrices,
  type SteamCoverageEntry,
} from "@/lib/supabaseServer";
import {
  lookupSteamPriceForDeal,
  lookupSteamPriceForKnownMatch,
  type SteamLookupResult,
} from "@/lib/steam";
import type { Deal, DealFilters, SortOption } from "@/lib/types";

const STEAM_PRICE_TTL_MS = 12 * 60 * 60 * 1000;
const STEAM_MISS_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

export type SteamRefreshOptions = {
  filters: DealFilters;
  sort: SortOption;
  limit: number;
  force?: boolean;
  mode?: "coverage" | "prices" | "balanced";
};

type SteamRefreshCandidate = {
  deal: Deal;
  coverage?: SteamCoverageEntry;
  reason: "unattempted" | "stale-match" | "stale-miss" | "forced";
};

export async function refreshSteamPrices(options: SteamRefreshOptions) {
  const force = options.force ?? false;
  const mode = options.mode ?? "balanced";
  const [deals, coverageByProductId] = await Promise.all([
    fetchCurrentDealsFromSupabase(),
    fetchSteamCoverageFromSupabase(),
  ]);
  const scopedDeals = sortDeals(filterDeals(deals, options.filters), options.sort);
  const allCandidates = pickSteamCandidates(
    scopedDeals,
    coverageByProductId,
    force,
    mode,
  );
  const candidates = allCandidates.slice(0, options.limit);
  const lookups = await runWithConcurrency(candidates, 2, async (candidate) => ({
    candidate,
    lookup: await lookupSteamCandidate(candidate),
  }));
  const successfulResults = lookups
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failedLookups = lookups.filter((result) => result.status === "rejected");
  const matched = successfulResults
    .map((result) => result.lookup)
    .filter((lookup) => lookup.found && lookup.price);
  const missed = successfulResults.filter(
    (result) =>
      result.candidate.reason !== "stale-match" &&
      (!result.lookup.found || !result.lookup.price),
  );
  const persistence = await persistExternalStorePrices(
    matched.map((lookup) => ({
      productId: lookup.productId,
      price: lookup.price!,
      raw: lookup.raw,
    })),
  );
  const missPersistence = await persistExternalStoreMisses(
    missed.map((result) => ({
      productId: result.lookup.productId,
      store: "steam",
      fetchedAt: new Date().toISOString(),
    })),
  );
  const remainingByReason = countByReason(
    allCandidates.slice(candidates.length).map((candidate) => candidate.reason),
  );

  return {
    scanned: candidates.length,
    matched: matched.length,
    notFound: missed.length,
    failed: failedLookups.length,
    remainingCandidates: Math.max(0, allCandidates.length - candidates.length),
    remainingByReason,
    coverage: getCoverageSummary(scopedDeals, coverageByProductId),
    persistence,
    missPersistence,
    examples: matched.slice(0, 5).map((lookup) => ({
      productId: lookup.productId,
      title: lookup.price?.title,
      price: lookup.price?.currentPrice,
      currency: lookup.price?.currency,
      confidence: lookup.price?.matchConfidence,
    })),
  };
}

async function lookupSteamCandidate(
  candidate: SteamRefreshCandidate,
): Promise<SteamLookupResult> {
  if (candidate.reason === "stale-match" && candidate.coverage?.externalId) {
    return lookupSteamPriceForKnownMatch(candidate.deal, {
      externalId: candidate.coverage.externalId,
      externalType: candidate.coverage.externalType,
      title: candidate.coverage.matchedTitle,
      url: candidate.coverage.externalUrl,
      confidence: candidate.coverage.matchConfidence,
    });
  }

  return lookupSteamPriceForDeal(candidate.deal);
}

function pickSteamCandidates(
  deals: Deal[],
  coverageByProductId: Map<string, SteamCoverageEntry>,
  force: boolean,
  mode: "coverage" | "prices" | "balanced",
): SteamRefreshCandidate[] {
  const comparableDeals = deals
    .filter((deal) => deal.contentType === "base-game")
    .filter((deal) => deal.currentPrice > 0);

  if (force) {
    return comparableDeals.map((deal) => ({
      deal,
      coverage: coverageByProductId.get(deal.id),
      reason: "forced",
    }));
  }

  const now = Date.now();
  const unattempted: SteamRefreshCandidate[] = [];
  const staleMatches: SteamRefreshCandidate[] = [];
  const staleMisses: SteamRefreshCandidate[] = [];

  comparableDeals.forEach((deal) => {
    const coverage = coverageByProductId.get(deal.id);

    if (!coverage) {
      unattempted.push({ deal, reason: "unattempted" });
      return;
    }

    if (coverage.externalId) {
      const fetchedAt = parseDate(coverage.priceFetchedAt ?? coverage.matchedAt);

      if (!fetchedAt || now - fetchedAt > STEAM_PRICE_TTL_MS) {
        staleMatches.push({ deal, coverage, reason: "stale-match" });
      }

      return;
    }

    const matchedAt = parseDate(coverage.matchedAt);

    if (!matchedAt || now - matchedAt > STEAM_MISS_RETRY_MS) {
      staleMisses.push({ deal, coverage, reason: "stale-miss" });
    }
  });

  const byDiscoveryPriority = (a: SteamRefreshCandidate, b: SteamRefreshCandidate) =>
    getSteamDiscoveryPriority(b.deal) - getSteamDiscoveryPriority(a.deal) ||
    a.deal.title.localeCompare(b.deal.title);
  const byRefreshPriority = (a: SteamRefreshCandidate, b: SteamRefreshCandidate) =>
    parseDate(a.coverage?.priceFetchedAt ?? a.coverage?.matchedAt) -
      parseDate(b.coverage?.priceFetchedAt ?? b.coverage?.matchedAt) ||
    a.deal.title.localeCompare(b.deal.title);

  unattempted.sort(byDiscoveryPriority);
  staleMatches.sort(byRefreshPriority);
  staleMisses.sort(byDiscoveryPriority);

  if (mode === "coverage") {
    return [...unattempted, ...staleMisses, ...staleMatches];
  }

  if (mode === "prices") {
    return [...staleMatches, ...unattempted, ...staleMisses];
  }

  return [...unattempted, ...staleMatches, ...staleMisses];
}

function getSteamDiscoveryPriority(deal: Deal): number {
  let score = 0;

  if (deal.platform === "pc" || deal.platform === "play-anywhere") {
    score += 50;
  }

  if (deal.discountPercent) {
    score += deal.discountPercent;
  }

  if (deal.currentPrice <= 1000) {
    score += 30;
  }

  if (deal.currentPrice <= 5000) {
    score += 15;
  }

  return score;
}

function getCoverageSummary(
  deals: Deal[],
  coverageByProductId: Map<string, SteamCoverageEntry>,
) {
  const comparableDeals = deals
    .filter((deal) => deal.contentType === "base-game")
    .filter((deal) => deal.currentPrice > 0);
  const attempted = comparableDeals.filter((deal) =>
    coverageByProductId.has(deal.id),
  );
  const matched = attempted.filter((deal) =>
    Boolean(coverageByProductId.get(deal.id)?.externalId),
  );

  return {
    comparable: comparableDeals.length,
    attempted: attempted.length,
    matched: matched.length,
    pending: Math.max(0, comparableDeals.length - attempted.length),
    attemptedPercent:
      comparableDeals.length > 0
        ? Math.round((attempted.length / comparableDeals.length) * 100)
        : 0,
    matchedPercent:
      comparableDeals.length > 0
        ? Math.round((matched.length / comparableDeals.length) * 100)
        : 0,
  };
}

function countByReason(reasons: SteamRefreshCandidate["reason"][]) {
  return reasons.reduce(
    (counts, reason) => ({
      ...counts,
      [reason]: counts[reason] + 1,
    }),
    {
      unattempted: 0,
      "stale-match": 0,
      "stale-miss": 0,
      forced: 0,
    },
  );
}

function parseDate(value?: string): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
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
