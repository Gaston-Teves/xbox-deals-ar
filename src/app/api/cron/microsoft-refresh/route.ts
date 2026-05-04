import { NextResponse } from "next/server";
import {
  fetchCatalogStatusFromSupabase,
  persistDealsToSupabase,
} from "@/lib/supabaseServer";
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
    const persistence = await persistDealsToSupabase(deals);
    const catalog = persistence.configured
      ? await fetchCatalogStatusFromSupabase()
      : undefined;

    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      microsoft: {
        discovered: deals.length,
        persistence,
      },
      catalog,
    });
  } catch (error) {
    console.error("Error en GET /api/cron/microsoft-refresh", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo refrescar Microsoft Store.",
      },
      { status: 500 },
    );
  }
}
