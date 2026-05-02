import { DealCard } from "@/components/DealCard";
import type { Deal } from "@/lib/types";

type DealsGridProps = {
  deals: Deal[];
};

export function DealsGrid({ deals }: DealsGridProps) {
  if (deals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/70 p-8 text-center">
        <h2 className="text-xl font-semibold text-zinc-100">
          No hay ofertas con esos filtros
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Proba subir el precio maximo, bajar el descuento minimo o limpiar las
          categorias.
        </p>
      </div>
    );
  }

  return (
    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {deals.map((deal) => (
        <DealCard key={deal.id} deal={deal} />
      ))}
    </section>
  );
}

