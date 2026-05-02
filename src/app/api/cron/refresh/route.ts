import { NextResponse } from "next/server";
import { defaultFilters } from "@/lib/dealFilters";
import {
  fetchCatalogStatusFromSupabase,
  persistDealsToSupabase,
} from "@/lib/supabaseServer";
import { refreshSteamPrices } from "@/lib/steamRefresh";
import { fetchXboxArgentinaDeals } from "@/lib/xboxScraper";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      {
        success: false,
        message: "Unauthorized",
      },
      { status: 401 },
    );
  }

  try {
    const startedAt = new Date().toISOString();
    const deals = await fetchXboxArgentinaDeals({ forceRefresh: true });
    const microsoftPersistence = await persistDealsToSupabase(deals);
    const steamLimit = getSteamCronLimit();
    const steam = await refreshSteamPrices({
      filters: {
        ...defaultFilters,
        hideFree: true,
        contentType: "base-games",
      },
      sort: "price-asc",
      limit: steamLimit,
      force: false,
      mode: "balanced",
    });
    const catalog = microsoftPersistence.configured
      ? await fetchCatalogStatusFromSupabase()
      : undefined;

    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      microsoft: {
        discovered: deals.length,
        persistence: microsoftPersistence,
      },
      steam,
      catalog,
    });
  } catch (error) {
    console.error("Error en GET /api/cron/refresh", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo ejecutar el refresh programado.",
      },
      { status: 500 },
    );
  }
}

function getSteamCronLimit(): number {
  const parsed = Number(process.env.STEAM_CRON_LIMIT);

  if (!Number.isFinite(parsed)) {
    return 250;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 500);
}
