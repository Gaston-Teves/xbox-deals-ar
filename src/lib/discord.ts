import { formatArs, platformLabels } from "./labels";
import { getDealSavings, sortDeals } from "./dealFilters";
import type { Deal } from "./types";

type DiscordOptions = {
  title?: string;
  maxDeals?: number;
};

export async function sendDealsToDiscord(
  deals: Deal[],
  webhookUrl: string,
  options: DiscordOptions = {},
) {
  const maxDeals = options.maxDeals ?? 10;
  const sortedDeals = sortDeals(deals, "price-asc").sort((a, b) => {
    if (a.currentPrice !== b.currentPrice) {
      return a.currentPrice - b.currentPrice;
    }

    return (b.discountPercent ?? 0) - (a.discountPercent ?? 0);
  });
  const selectedDeals = sortedDeals.slice(0, maxDeals);
  const extraCount = Math.max(sortedDeals.length - selectedDeals.length, 0);
  const content = buildDiscordMessage(selectedDeals, extraCount, options.title);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(`Discord respondio ${response.status}: ${response.statusText}`);
  }

  return {
    count: selectedDeals.length,
    total: sortedDeals.length,
    savings: selectedDeals.reduce((total, deal) => total + getDealSavings(deal), 0),
  };
}

function buildDiscordMessage(
  deals: Deal[],
  extraCount: number,
  title = "Ofertas Xbox Argentina",
): string {
  if (deals.length === 0) {
    return `🔥 ${title}\n\nNo hay ofertas para los filtros seleccionados.`;
  }

  const lines = [`🔥 ${title}`, ""];

  deals.forEach((deal, index) => {
    lines.push(`${index + 1}. ${deal.title}`);
    lines.push(`   Precio: ${formatArs(deal.currentPrice)} ARS`);
    lines.push(
      `   Antes: ${
        deal.originalPrice ? `${formatArs(deal.originalPrice)} ARS` : "Sin dato"
      }`,
    );
    lines.push(`   Descuento: ${deal.discountPercent ?? 0}%`);
    lines.push(`   Plataforma: ${platformLabels[deal.platform]}`);
    lines.push(`   Link: ${deal.storeUrl}`);
    lines.push("");
  });

  if (extraCount > 0) {
    lines.push(`Y ${extraCount} ofertas mas...`);
  }

  return lines.join("\n").trim();
}

