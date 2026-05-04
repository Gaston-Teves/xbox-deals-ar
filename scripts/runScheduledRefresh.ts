import { defaultFilters } from "../src/lib/dealFilters";
import {
  fetchCatalogStatusFromSupabase,
  persistDealsToSupabase,
} from "../src/lib/supabaseServer";
import { refreshSteamPrices } from "../src/lib/steamRefresh";
import { fetchXboxArgentinaDeals } from "../src/lib/xboxScraper";

async function main() {
  const startedAt = new Date().toISOString();
  const steamLimit = getPositiveInteger(process.env.STEAM_CRON_LIMIT, 250);

  console.log(`Scheduled refresh started at ${startedAt}`);

  const deals = await fetchXboxArgentinaDeals({ forceRefresh: true });
  const microsoft = await persistDealsToSupabase(deals);

  console.log(
    `Microsoft refresh: ${deals.length} deals, ${microsoft.upserted} current rows, ${microsoft.priceHistoryInserted} history rows.`,
  );

  const steam = await refreshSteamPrices({
    filters: {
      ...defaultFilters,
      hideFree: true,
      contentType: "base-games",
    },
    sort: "price-asc",
    limit: steamLimit,
    force: false,
    mode: "balanced",
  });

  console.log(
    `Steam refresh: scanned ${steam.scanned}, matched ${steam.matched}, not found ${steam.notFound}, failed ${steam.failed}.`,
  );

  const catalog = await fetchCatalogStatusFromSupabase();

  console.log(
    `Catalog status: ${catalog.catalogProducts} products, ${catalog.trackedPrices} prices, ${catalog.coveragePercent}% coverage.`,
  );
  console.log(`Scheduled refresh finished at ${new Date().toISOString()}`);
}

function getPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
}

main().catch((error) => {
  console.error("Scheduled refresh failed", error);
  process.exitCode = 1;
});
