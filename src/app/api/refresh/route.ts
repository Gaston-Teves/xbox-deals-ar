import { NextResponse } from "next/server";
import {
  fetchCatalogStatusFromSupabase,
  persistDealsToSupabase,
} from "@/lib/supabaseServer";
import { fetchXboxArgentinaDeals } from "@/lib/xboxScraper";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const deals = await fetchXboxArgentinaDeals({ forceRefresh: true });
    const persistence = await persistDealsToSupabase(deals);
    const catalogStatus = persistence.configured
      ? await fetchCatalogStatusFromSupabase()
      : undefined;

    return NextResponse.json({
      success: true,
      count: deals.length,
      discovery: {
        discoveredThisRun: persistence.discoveredProducts,
        previouslyTracked: persistence.previouslyTrackedProducts,
        newlyTracked: persistence.newDeals,
      },
      tracking: {
        pricesUpdated: persistence.upserted,
        priceHistoryInserted: persistence.priceHistoryInserted,
        priceChanges: persistence.priceChanges,
        historyBackfilled: persistence.historyBackfilled,
      },
      catalog: catalogStatus,
      persistence,
      refreshedAt: new Date().toISOString(),
      message: persistence.configured
        ? `Cache actualizado, ${persistence.catalogUpserted} productos catalogados y ${persistence.upserted} precios guardados en Supabase.`
        : "Cache actualizado. Supabase no esta configurado.",
    });
  } catch (error) {
    console.error("Error en POST /api/refresh", error);

    return NextResponse.json(
      {
        success: false,
        count: 0,
        message: "No se pudo refrescar la lista de ofertas.",
      },
      { status: 500 },
    );
  }
}
