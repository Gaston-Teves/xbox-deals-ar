import { NextResponse } from "next/server";
import { parseQueryFilters } from "@/lib/dealFilters";
import { refreshSteamPrices } from "@/lib/steamRefresh";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));
    const force = parseBoolean(searchParams.get("force"));
    const mode = parseMode(searchParams.get("mode"));
    const { filters, sort } = parseQueryFilters(searchParams);
    const result = await refreshSteamPrices({
      filters,
      sort,
      limit,
      force,
      mode,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error en POST /api/refresh-steam", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "No se pudo refrescar Steam. Verifica Supabase y ejecuta supabase/schema.sql actualizado.",
      },
      { status: 500 },
    );
  }
}

function parseLimit(value: string | null): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 50;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 500);
}

function parseBoolean(value: string | null): boolean {
  return value === "true" || value === "1";
}

function parseMode(value: string | null) {
  if (value === "coverage" || value === "prices" || value === "balanced") {
    return value;
  }

  return "balanced";
}
