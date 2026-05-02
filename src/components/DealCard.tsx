import {
  categoryLabels,
  contentTypeLabels,
  formatArs,
  formatMoney,
  modeLabels,
  platformLabels,
} from "@/lib/labels";
import { getDealSavings } from "@/lib/dealFilters";
import type { Deal } from "@/lib/types";

type DealCardProps = {
  deal: Deal;
};

export function DealCard({ deal }: DealCardProps) {
  const savings = getDealSavings(deal);
  const primaryExternalPrice = deal.externalPrices?.[0];

  return (
    <article className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:border-emerald-400/60">
      <div
        className="relative aspect-[16/9] bg-[radial-gradient(circle_at_top_left,#22c55e33,transparent_36%),linear-gradient(135deg,#111827,#18181b)] bg-cover bg-center"
        style={
          deal.imageUrl
            ? { backgroundImage: `url("${deal.imageUrl}")` }
            : undefined
        }
        aria-label={`Imagen de ${deal.title}`}
      >
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className="rounded bg-emerald-400 px-2 py-1 text-xs font-bold text-zinc-950">
            {platformLabels[deal.platform]}
          </span>
          {getDealBadges(deal).map((badge) => (
            <span
              key={badge}
              className="rounded bg-fuchsia-500 px-2 py-1 text-xs font-bold text-white"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h2 className="line-clamp-2 min-h-11 text-base font-semibold text-zinc-50">
            {deal.title}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Detectado: {new Date(deal.detectedAt).toLocaleDateString("es-AR")}
          </p>
        </div>

        <div>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <p className="text-3xl font-bold text-emerald-300">
              {formatArs(deal.currentPrice)}
            </p>
            {deal.originalPrice ? (
              <p className="pb-1 text-sm text-zinc-500 line-through">
                {formatArs(deal.originalPrice)}
              </p>
            ) : null}
            {deal.discountPercent ? (
              <p className="rounded bg-fuchsia-500/15 px-2 py-1 text-sm font-semibold text-fuchsia-200">
                -{deal.discountPercent}%
              </p>
            ) : null}
          </div>

          {primaryExternalPrice ? (
            <a
              href={primaryExternalPrice.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center justify-between gap-3 rounded-md border border-sky-400/20 bg-sky-950/20 px-3 py-2 text-sm transition hover:border-sky-300/60"
            >
              <span className="min-w-0">
                <span className="font-semibold text-sky-200">Steam</span>
                <span className="ml-2 truncate text-xs text-zinc-500">
                  {primaryExternalPrice.title}
                </span>
              </span>
              <span className="shrink-0 font-bold text-sky-100">
                {formatMoney(
                  primaryExternalPrice.currentPrice,
                  primaryExternalPrice.currency,
                )}
              </span>
            </a>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
          <MetaBadge>{contentTypeLabels[deal.contentType]}</MetaBadge>
          <MetaBadge>Game Pass: {deal.isGamePass ? "Si" : "No"}</MetaBadge>
          {deal.pcPlayableViaIncludedGame ? (
            <MetaBadge>Incluye PC: {deal.pcPlayableViaIncludedGame}</MetaBadge>
          ) : null}
          {savings > 0 ? <MetaBadge>Ahorro {formatArs(savings)}</MetaBadge> : null}
          {deal.isHistoricalLow ? <MetaBadge>Minimo historico</MetaBadge> : null}
        </div>

        <details className="group/details rounded-md border border-zinc-800 bg-zinc-900/40">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium text-zinc-300 marker:hidden">
            Detalles
            <span className="text-xs text-zinc-500 transition group-open/details:rotate-180">
              v
            </span>
          </summary>
          <div className="space-y-3 border-t border-zinc-800 p-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <CompactStat label="Plataforma" value={platformLabels[deal.platform]} />
              {deal.pcPlayableViaIncludedGame ? (
                <CompactStat
                  label="Jugable en PC"
                  value={`Incluye ${deal.pcPlayableViaIncludedGame}`}
                />
              ) : null}
              <CompactStat
                label="Precio anterior"
                value={formatArs(deal.previousPrice)}
              />
              <CompactStat
                label="Minimo registrado"
                value={formatArs(deal.lowestPrice)}
              />
              <CompactStat label="Game Pass" value={deal.isGamePass ? "Si" : "No"} />
              {primaryExternalPrice ? (
                <CompactStat
                  label="Steam"
                  value={formatMoney(
                    primaryExternalPrice.currentPrice,
                    primaryExternalPrice.currency,
                  )}
                />
              ) : null}
            </div>

            <TagGroup
              label="Categorias"
              values={deal.categories.map((category) => categoryLabels[category])}
            />
            <TagGroup
              label="Modos"
              values={deal.modes.map((mode) => modeLabels[mode])}
            />
          </div>
        </details>

        <a
          href={deal.storeUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center justify-center rounded-md bg-emerald-400 px-4 py-2 text-center text-sm font-bold text-zinc-950 transition hover:bg-emerald-300"
        >
          Ver en Microsoft Store
        </a>
      </div>
    </article>
  );
}

function getDealBadges(deal: Deal): string[] {
  const badges: string[] = [];

  if (deal.priceChange === "new") {
    badges.push("Nuevo");
  }

  if (deal.priceChange === "down") {
    badges.push("Bajo");
  }

  if (deal.isHistoricalLow) {
    badges.push("Minimo");
  }

  return badges;
}

function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1">
      {children}
    </span>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 font-semibold text-zinc-200">{value}</p>
    </div>
  );
}

function TagGroup({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-300"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
