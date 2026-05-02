import { formatArs } from "@/lib/labels";
import type { Deal } from "@/lib/types";

type Stats = {
  total: number;
  cheapestDeal?: Deal;
  maxDiscountDeal?: Deal;
  maxSavingsDeal?: Deal;
  historicalLowCount?: number;
  newCount?: number;
  priceDropCount?: number;
};

type StatsBarProps = {
  stats: Stats;
};

export function StatsBar({ stats }: StatsBarProps) {
  return (
    <section className="grid gap-3 md:grid-cols-3">
      <StatItem
        label="Ofertas visibles"
        value={stats.total.toString()}
        detail="segun los filtros activos"
      />
      <StatItem
        label="Mas barata"
        value={formatArs(stats.cheapestDeal?.currentPrice)}
        detail={stats.cheapestDeal?.title ?? "Sin resultados"}
      />
      <StatItem
        label="Mayor descuento"
        value={`${stats.maxDiscountDeal?.discountPercent ?? 0}%`}
        detail={stats.maxDiscountDeal?.title ?? "Sin resultados"}
      />
    </section>
  );
}

function StatItem({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-lg border border-emerald-400/20 bg-zinc-950/80 p-4 shadow-[0_0_24px_rgba(34,197,94,0.08)]">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-zinc-50">{value}</p>
      <p className="mt-1 truncate text-sm text-zinc-400">{detail}</p>
    </article>
  );
}
