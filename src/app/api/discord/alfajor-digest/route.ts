import { NextResponse } from "next/server";
import {
  buildAlfajorDigest,
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

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const threshold =
      parsePositiveNumber(searchParams.get("maxPrice")) ??
      getAlfajorPriceThreshold();
    const maxDeals = parseLimit(searchParams.get("limit"));
    const includeRecentlySent = parseBoolean(searchParams.get("includeRecent"));
    const dryRun = parseBoolean(searchParams.get("dryRun"));
    const trackedDeals = isSupabaseConfigured()
      ? await fetchTrackedDealsFromSupabase()
      : [];
    const deals =
      trackedDeals.length > 0 ? trackedDeals : await fetchXboxArgentinaDeals();

    if (dryRun) {
      const preview = await buildAlfajorDigest(deals, {
        threshold,
        maxDeals,
        includeRecentlySent,
      });

      return NextResponse.json({
        success: true,
        dryRun: true,
        threshold: preview.threshold,
        candidates: preview.candidates,
        selected: preview.selected.map(({ deal, score, reasons }) => ({
          id: deal.id,
          title: deal.title,
          currentPrice: deal.currentPrice,
          platform: deal.platform,
          discountPercent: deal.discountPercent,
          score,
          reasons,
          steam: deal.externalPrices?.[0]
            ? {
                title: deal.externalPrices[0].title,
                price: deal.externalPrices[0].currentPrice,
                currency: deal.externalPrices[0].currency,
                confidence: deal.externalPrices[0].matchConfidence,
              }
            : null,
        })),
      });
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

    const result = await sendAlfajorDigestToDiscord(deals, webhookUrl, {
      threshold,
      maxDeals,
      includeRecentlySent,
      sentTo: "discord:alfajor",
    });

    return NextResponse.json({
      success: true,
      threshold: result.threshold,
      candidates: result.candidates,
      selected: result.selected.length,
      message: `Digest enviado con ${result.selected.length} juegos por debajo de ${result.threshold} ARS.`,
    });
  } catch (error) {
    console.error("Error en POST /api/discord/alfajor-digest", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo enviar el digest mas barato que un alfajor.",
      },
      { status: 500 },
    );
  }
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 50);
}

function parsePositiveNumber(value: string | null): number | undefined {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.floor(parsed);
}

function parseBoolean(value: string | null): boolean {
  return value === "true" || value === "1";
}
