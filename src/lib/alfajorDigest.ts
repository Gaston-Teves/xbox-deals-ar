import { getDealSavings } from "./dealFilters";
import { formatArs, formatMoney, platformLabels } from "./labels";
import {
  fetchRecentAlertProductIds,
  persistAlertEvents,
} from "./supabaseServer";
import type { Deal } from "./types";

export const ALFAJOR_ALERT_TYPE = "alfajor-digest";
const DEFAULT_ALFAJOR_PRICE_ARS = 1800;
const DEFAULT_MAX_DEALS = 10;
const DEFAULT_REPEAT_DAYS = 7;

const franchiseBoosts: Array<{ pattern: RegExp; boost: number; reason: string }> = [
  { pattern: /\b(age of empires|aoe)\b/i, boost: 80, reason: "franquicia historica" },
  { pattern: /\b(alan wake|control)\b/i, boost: 80, reason: "juego reconocido" },
  { pattern: /\b(batman|arkham)\b/i, boost: 85, reason: "franquicia reconocida" },
  { pattern: /\b(bioshock)\b/i, boost: 85, reason: "clasico moderno" },
  { pattern: /\b(borderlands)\b/i, boost: 75, reason: "saga conocida" },
  { pattern: /\b(call of duty|modern warfare|black ops)\b/i, boost: 90, reason: "saga masiva" },
  { pattern: /\b(castlevania)\b/i, boost: 80, reason: "clasico reconocido" },
  { pattern: /\b(cuphead)\b/i, boost: 85, reason: "indie muy conocido" },
  { pattern: /\b(dayz)\b/i, boost: 85, reason: "survival reconocido" },
  { pattern: /\b(dead cells|hades|hollow knight|celeste)\b/i, boost: 85, reason: "indie destacado" },
  { pattern: /\b(dead space|resident evil|silent hill)\b/i, boost: 85, reason: "horror reconocido" },
  { pattern: /\b(dishonored|prey)\b/i, boost: 75, reason: "cult classic" },
  { pattern: /\b(doom|quake|wolfenstein)\b/i, boost: 90, reason: "clasico de PC" },
  { pattern: /\b(dragon age|mass effect)\b/i, boost: 85, reason: "RPG reconocido" },
  { pattern: /\b(fallout|the elder scrolls|skyrim|oblivion|morrowind)\b/i, boost: 90, reason: "RPG historico" },
  { pattern: /\b(far cry|assassin'?s creed|watch dogs)\b/i, boost: 80, reason: "franquicia conocida" },
  { pattern: /\b(forza|halo|gears of war|gears)\b/i, boost: 90, reason: "saga Xbox/PC reconocida" },
  { pattern: /\b(grand theft auto|gta|red dead redemption)\b/i, boost: 95, reason: "franquicia masiva" },
  { pattern: /\b(hitman)\b/i, boost: 75, reason: "saga conocida" },
  { pattern: /\b(lego)\b/i, boost: 70, reason: "licencia popular" },
  { pattern: /\b(limbo|inside)\b/i, boost: 80, reason: "indie reconocido" },
  { pattern: /\b(metro)\b/i, boost: 85, reason: "saga reconocida" },
  { pattern: /\b(minecraft)\b/i, boost: 95, reason: "juego masivo" },
  { pattern: /\b(mortal kombat|tekken|street fighter)\b/i, boost: 85, reason: "pelea reconocida" },
  { pattern: /\b(ori and the blind forest|ori and the will of the wisps)\b/i, boost: 90, reason: "indie destacado" },
  { pattern: /\b(persona|yakuza|like a dragon)\b/i, boost: 85, reason: "saga reconocida" },
  { pattern: /\b(portal|half-life|left 4 dead)\b/i, boost: 95, reason: "clasico de PC" },
  { pattern: /\b(psychonauts)\b/i, boost: 75, reason: "cult classic" },
  { pattern: /\b(rise of the tomb raider|shadow of the tomb raider|tomb raider)\b/i, boost: 85, reason: "franquicia reconocida" },
  { pattern: /\b(stardew valley|terraria|undertale)\b/i, boost: 85, reason: "indie masivo" },
  { pattern: /\b(the walking dead|life is strange)\b/i, boost: 75, reason: "aventura reconocida" },
  { pattern: /\b(the witcher)\b/i, boost: 90, reason: "RPG reconocido" },
  { pattern: /\b(titanfall)\b/i, boost: 75, reason: "saga conocida" },
];

type RankedAlfajorDeal = {
  deal: Deal;
  score: number;
  reasons: string[];
};

type ComparableAlfajorDeal = {
  deal: Deal;
  pcReason?: string;
};

export type AlfajorDigestResult = {
  threshold: number;
  candidates: number;
  selected: RankedAlfajorDeal[];
  sent?: {
    count: number;
    total: number;
  };
};

export async function buildAlfajorDigest(
  deals: Deal[],
  options: {
    threshold?: number;
    maxDeals?: number;
    includeRecentlySent?: boolean;
    repeatDays?: number;
  } = {},
): Promise<AlfajorDigestResult> {
  const threshold = options.threshold ?? getAlfajorPriceThreshold();
  const maxDeals = options.maxDeals ?? getAlfajorMaxDeals();
  const repeatDays = options.repeatDays ?? getAlfajorRepeatDays();
  const recentlySent = options.includeRecentlySent
    ? new Set<string>()
    : await fetchRecentAlertProductIds(
        ALFAJOR_ALERT_TYPE,
        new Date(Date.now() - repeatDays * 24 * 60 * 60 * 1000).toISOString(),
      );
  const candidates = deals
    .map((deal) => toComparablePcDeal(deal, deals))
    .filter((entry): entry is ComparableAlfajorDeal => Boolean(entry))
    .filter(
      (entry) =>
        entry.deal.currentPrice > 0 && entry.deal.currentPrice <= threshold,
    )
    .map(rankAlfajorDeal)
    .filter((ranked) => ranked.score >= 45)
    .filter((ranked) => !recentlySent.has(ranked.deal.id))
    .sort((a, b) => b.score - a.score || a.deal.currentPrice - b.deal.currentPrice);

  return {
    threshold,
    candidates: candidates.length,
    selected: candidates.slice(0, maxDeals),
  };
}

export async function sendAlfajorDigestToDiscord(
  deals: Deal[],
  webhookUrl: string,
  options: {
    threshold?: number;
    maxDeals?: number;
    includeRecentlySent?: boolean;
    repeatDays?: number;
    sentTo?: string;
  } = {},
): Promise<AlfajorDigestResult> {
  const digest = await buildAlfajorDigest(deals, options);
  const content = buildAlfajorDiscordMessage(digest);
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(`Discord respondio ${response.status}: ${response.statusText}`);
  }

  await persistAlertEvents(
    digest.selected.map(({ deal, score, reasons }) => ({
      productId: deal.id,
      alertType: ALFAJOR_ALERT_TYPE,
      dealSnapshot: {
        id: deal.id,
        title: deal.title,
        currentPrice: deal.currentPrice,
        originalPrice: deal.originalPrice,
        discountPercent: deal.discountPercent,
        platform: deal.platform,
        storeUrl: deal.storeUrl,
        score,
        reasons,
      },
      sentTo: options.sentTo ?? "discord",
    })),
  );

  return {
    ...digest,
    sent: {
      count: digest.selected.length,
      total: digest.candidates,
    },
  };
}

export function getAlfajorPriceThreshold(): number {
  const parsed = Number(process.env.ALFAJOR_PRICE_ARS);

  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_ALFAJOR_PRICE_ARS;
}

export function getAlfajorMaxDeals(): number {
  const parsed = Number(process.env.ALFAJOR_DIGEST_MAX_DEALS);

  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.floor(parsed), 1), 20)
    : DEFAULT_MAX_DEALS;
}

function getAlfajorRepeatDays(): number {
  const parsed = Number(process.env.ALFAJOR_REPEAT_DAYS);

  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.floor(parsed), 1), 30)
    : DEFAULT_REPEAT_DAYS;
}

function toComparablePcDeal(
  deal: Deal,
  allDeals: Deal[],
): ComparableAlfajorDeal | undefined {
  if (deal.contentType !== "base-game") {
    return undefined;
  }

  if (deal.platform === "pc" || deal.platform === "play-anywhere") {
    return { deal };
  }

  const includedBase = findIncludedPcBaseGame(deal, allDeals);

  if (includedBase) {
    return {
      deal,
      pcReason: `incluye ${includedBase.title} para PC`,
    };
  }

  return undefined;
}

function rankAlfajorDeal(entry: ComparableAlfajorDeal): RankedAlfajorDeal {
  const { deal } = entry;
  const reasons: string[] = [];
  let score = 0;
  const franchise = franchiseBoosts.find((entry) => entry.pattern.test(deal.title));

  if (franchise) {
    score += franchise.boost;
    reasons.push(franchise.reason);
  }

  const steamPrice = deal.externalPrices?.[0];

  if (steamPrice) {
    const confidence = steamPrice.matchConfidence ?? 0;
    score += Math.min(confidence, 100) * 0.55;
    reasons.push(`match Steam ${confidence}%`);
  }

  if (deal.isHistoricalLow) {
    score += 20;
    reasons.push("minimo historico");
  }

  if ((deal.discountPercent ?? 0) >= 70) {
    score += 15;
    reasons.push(`${deal.discountPercent}% off`);
  } else if ((deal.discountPercent ?? 0) >= 40) {
    score += 8;
    reasons.push(`${deal.discountPercent}% off`);
  }

  if (getDealSavings(deal) > 0) {
    score += Math.min(getDealSavings(deal) / 200, 18);
  }

  if (deal.currentPrice <= 500) {
    score += 15;
    reasons.push("precio absurdo");
  } else if (deal.currentPrice <= 1000) {
    score += 8;
  }

  if (deal.platform === "play-anywhere") {
    score += 8;
    reasons.push("Xbox + PC");
  }

  if (entry.pcReason) {
    score += 10;
    reasons.push(entry.pcReason);
  }

  return {
    deal,
    score: Math.round(score),
    reasons: [...new Set(reasons)].slice(0, 3),
  };
}

function findIncludedPcBaseGame(deal: Deal, allDeals: Deal[]): Deal | undefined {
  const title = normalizeDigestTitle(deal.title);

  if (!/\b(edition|edicion|paquete|bundle|pack|collection|coleccion)\b/.test(title)) {
    return undefined;
  }

  return allDeals
    .filter((candidate) => candidate.id !== deal.id)
    .filter((candidate) => candidate.contentType === "base-game")
    .filter(
      (candidate) =>
        candidate.platform === "pc" || candidate.platform === "play-anywhere",
    )
    .filter((candidate) => {
      const candidateTitle = normalizeDigestTitle(candidate.title);

      return (
        candidateTitle.length >= 3 &&
        (title === candidateTitle ||
          title.startsWith(`${candidateTitle} `) ||
          title.includes(` ${candidateTitle} `))
      );
    })
    .sort(
      (a, b) =>
        normalizeDigestTitle(a.title).length - normalizeDigestTitle(b.title).length,
    )[0];
}

function normalizeDigestTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(pc|windows|xbox|one|series|xs)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAlfajorDiscordMessage(digest: AlfajorDigestResult): string {
  if (digest.selected.length === 0) {
    return [
      "Mas barato que un alfajor",
      "",
      `No encontre juegos de PC relevantes por debajo de ${formatArs(
        digest.threshold,
      )} en esta corrida.`,
    ].join("\n");
  }

  const lines = [
    "Mas barato que un alfajor",
    "",
    `Juegos de PC en Xbox/Microsoft Store Argentina por menos de ${formatArs(
      digest.threshold,
    )}. No todos son ofertas: algunos simplemente estan muy baratos.`,
    "",
  ];

  digest.selected.forEach(({ deal, reasons }, index) => {
    const steamPrice = deal.externalPrices?.[0];

    lines.push(`${index + 1}. ${deal.title}`);
    lines.push(`   Xbox: ${formatArs(deal.currentPrice)}`);
    lines.push(
      `   Steam: ${
        steamPrice
          ? `${formatMoney(steamPrice.currentPrice, steamPrice.currency)}`
          : "sin equivalencia confirmada"
      }`,
    );
    lines.push(`   Plataforma: ${platformLabels[deal.platform]}`);
    lines.push(`   Descuento Xbox: ${deal.discountPercent ?? 0}%`);
    lines.push(`   Motivo: ${reasons.length > 0 ? reasons.join(" + ") : "precio bajo"}`);
    lines.push(`   Link: ${deal.storeUrl}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}
