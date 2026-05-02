import { NextResponse } from "next/server";
import { filterDeals, parseQueryFilters } from "@/lib/dealFilters";
import { sendDealsToDiscord } from "@/lib/discord";
import {
  fetchTrackedDealsFromSupabase,
  isSupabaseConfigured,
} from "@/lib/supabaseServer";
import { fetchXboxArgentinaDeals } from "@/lib/xboxScraper";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return NextResponse.json(
      {
        success: false,
        count: 0,
        message:
          "Falta configurar DISCORD_WEBHOOK_URL en las variables de entorno.",
      },
      { status: 400 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const { filters } = parseQueryFilters(searchParams);
    const trackedDeals = isSupabaseConfigured()
      ? await fetchTrackedDealsFromSupabase()
      : [];
    const deals =
      trackedDeals.length > 0 ? trackedDeals : await fetchXboxArgentinaDeals();
    const filteredDeals = filterDeals(deals, filters);
    const result = await sendDealsToDiscord(filteredDeals, webhookUrl);

    return NextResponse.json({
      success: true,
      count: result.total,
      message: `Resumen enviado a Discord con ${result.count} ofertas destacadas.`,
    });
  } catch (error) {
    console.error("Error en POST /api/notify-discord", error);

    return NextResponse.json(
      {
        success: false,
        count: 0,
        message: "No se pudo enviar el resumen a Discord.",
      },
      { status: 500 },
    );
  }
}
