import { NextResponse } from "next/server";
import { defaultFilters } from "@/lib/dealFilters";
import { sendAlfajorDigestToDiscord } from "@/lib/alfajorDigest";
import {
  fetchCatalogStatusFromSupabase,
  fetchTrackedDealsFromSupabase,
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
    const steam = await refreshSteamPrices({
      filters: {
        ...defaultFilters,
        hideFree: true,
        contentType: "base-games",
      },
      sort: "price-asc",
      limit: getSteamCronLimit(),
      force: false,
      mode: "balanced",
    });
    const webhookUrl =
      process.env.ALFAJOR_DISCORD_WEBHOOK_URL ?? process.env.DISCORD_WEBHOOK_URL;
    const trackedDeals = await fetchTrackedDealsFromSupabase();
    const digest =
      webhookUrl && trackedDeals.length > 0
        ? await sendAlfajorDigestToDiscord(trackedDeals, webhookUrl, {
            sentTo: "discord:alfajor:daily-cron",
          })
        : undefined;
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
      digest: digest
        ? {
            threshold: digest.threshold,
            candidates: digest.candidates,
            selected: digest.selected.length,
            sent: digest.sent,
          }
        : {
            skipped: true,
            reason: webhookUrl
              ? "No hay deals persistidos para armar el digest."
              : "Falta configurar webhook de Discord.",
          },
      catalog,
    });
  } catch (error) {
    console.error("Error en GET /api/cron/daily", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo ejecutar el cron diario.",
      },
      { status: 500 },
    );
  }
}

function getSteamCronLimit(): number {
  const parsed = Number(process.env.STEAM_CRON_LIMIT);

  if (!Number.isFinite(parsed)) {
    return 150;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 500);
}
