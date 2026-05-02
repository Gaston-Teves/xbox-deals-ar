import { NextResponse } from "next/server";
import {
  getAlfajorPriceThreshold,
  sendAlfajorDigestToDiscord,
} from "@/lib/alfajorDigest";
import {
  fetchTrackedDealsFromSupabase,
  isSupabaseConfigured,
} from "@/lib/supabaseServer";
import { fetchXboxArgentinaDeals } from "@/lib/xboxScraper";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

  const webhookUrl =
    process.env.ALFAJOR_DISCORD_WEBHOOK_URL ?? process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Falta configurar ALFAJOR_DISCORD_WEBHOOK_URL o DISCORD_WEBHOOK_URL.",
      },
      { status: 400 },
    );
  }

  try {
    const trackedDeals = isSupabaseConfigured()
      ? await fetchTrackedDealsFromSupabase()
      : [];
    const deals =
      trackedDeals.length > 0 ? trackedDeals : await fetchXboxArgentinaDeals();
    const result = await sendAlfajorDigestToDiscord(deals, webhookUrl, {
      threshold: getAlfajorPriceThreshold(),
      sentTo: "discord:alfajor:cron",
    });

    return NextResponse.json({
      success: true,
      threshold: result.threshold,
      candidates: result.candidates,
      selected: result.selected.length,
      sent: result.sent,
    });
  } catch (error) {
    console.error("Error en GET /api/cron/alfajor-digest", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo ejecutar el digest programado.",
      },
      { status: 500 },
    );
  }
}
