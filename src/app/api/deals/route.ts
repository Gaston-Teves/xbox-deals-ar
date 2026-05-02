import { NextResponse } from "next/server";
import {
  filterDeals,
  getBestDealStats,
  markPcPlayableIncludedGames,
  parseQueryFilters,
  sortDeals,
} from "@/lib/dealFilters";
import {
  enrichDealsWithStoredMetadata,
  enrichDealsWithHistory,
  fetchCurrentDealsFromSupabase,
  fetchTrackedDealsFromSupabase,
  isSupabaseConfigured,
} from "@/lib/supabaseServer";
import { fetchXboxArgentinaDeals } from "@/lib/xboxScraper";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { filters, sort } = parseQueryFilters(searchParams);
    const page = parsePaginationNumber(searchParams.get("page"), 1, 1, 10_000);
    const pageSize = parsePaginationNumber(
      searchParams.get("pageSize"),
      60,
      12,
      120,
    );
    const trackedDeals = isSupabaseConfigured()
      ? await fetchCurrentDealsFromSupabase()
      : [];
    const deals =
      trackedDeals.length > 0 ? trackedDeals : await fetchXboxArgentinaDeals();
    const enrichedDeals =
      trackedDeals.length > 0 ? deals : await enrichDealsWithHistory(deals);
    const markedDeals = markPcPlayableIncludedGames(enrichedDeals);
    const filteredDeals = filterDeals(markedDeals, filters);
    const sortedDeals = sortDeals(filteredDeals, sort);
    const total = sortedDeals.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * pageSize;
    const pagedDeals = sortedDeals.slice(start, start + pageSize);
    const responseDeals =
      trackedDeals.length > 0
        ? restoreComputedDealFields(
            await enrichDealsWithStoredMetadata(pagedDeals),
            pagedDeals,
          )
        : pagedDeals;

    return NextResponse.json({
      deals: responseDeals,
      total,
      page: currentPage,
      pageSize,
      totalPages,
      hasPreviousPage: currentPage > 1,
      hasNextPage: currentPage < totalPages,
      filters,
      sort,
      stats: getBestDealStats(sortedDeals),
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error en GET /api/deals", error);

    return NextResponse.json(
      {
        error: "No se pudieron obtener las ofertas.",
      },
      { status: 500 },
    );
  }
}

function restoreComputedDealFields<T extends { id: string }>(
  enrichedDeals: T[],
  sourceDeals: Array<T & { pcPlayableViaIncludedGame?: string }>,
): T[] {
  const sourceById = new Map(sourceDeals.map((deal) => [deal.id, deal]));

  return enrichedDeals.map((deal) => {
    const source = sourceById.get(deal.id);

    if (!source?.pcPlayableViaIncludedGame) {
      return deal;
    }

    return {
      ...deal,
      pcPlayableViaIncludedGame: source.pcPlayableViaIncludedGame,
    };
  });
}

function parsePaginationNumber(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsed), min), max);
}
