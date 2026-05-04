import { NextResponse } from "next/server";
import { defaultFilters } from "@/lib/dealFilters";
import { refreshSteamPrices } from "@/lib/steamRefresh";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_STEAM_ITEMS_PER_CRON = 100;

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

    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      steam,
    });
  } catch (error) {
    console.error("Error en GET /api/cron/steam-refresh", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo refrescar Steam.",
      },
      { status: 500 },
    );
  }
}

function getSteamCronLimit(): number {
  const parsed = Number(process.env.STEAM_CRON_LIMIT);

  if (!Number.isFinite(parsed)) {
    return MAX_STEAM_ITEMS_PER_CRON;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), MAX_STEAM_ITEMS_PER_CRON);
}
