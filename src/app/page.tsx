"use client";

import { useEffect, useMemo, useState } from "react";
import { DealsGrid } from "@/components/DealsGrid";
import { Filters } from "@/components/Filters";
import { StatsBar } from "@/components/StatsBar";
import { defaultFilters } from "@/lib/dealFilters";
import type { Deal, DealFilters, SortOption } from "@/lib/types";

type ApiResponse = {
  deals: Deal[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  filters: DealFilters;
  sort: SortOption;
  stats: {
    total: number;
    cheapestDeal?: Deal;
    maxDiscountDeal?: Deal;
    maxSavingsDeal?: Deal;
  };
};

export default function Home() {
  const [filters, setFilters] = useState<DealFilters>(defaultFilters);
  const [sort, setSort] = useState<SortOption>("price-asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(60);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
  const [isNotifying, setIsNotifying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingSteam, setIsRefreshingSteam] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const queryString = useMemo(
    () => buildQueryString(filters, sort, page, pageSize),
    [filters, sort, page, pageSize],
  );

  function changeFilters(nextFilters: DealFilters) {
    setFilters(nextFilters);
    setPage(1);
  }

  function changeSort(nextSort: SortOption) {
    setSort(nextSort);
    setPage(1);
  }

  function changePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadDeals() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/deals?${queryString}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("La API no respondio correctamente.");
        }

        const nextData = (await response.json()) as ApiResponse;
        setData(nextData);
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }

        setError("No se pudieron cargar las ofertas. Intenta de nuevo.");
      } finally {
        setIsLoading(false);
      }
    }

    loadDeals();

    return () => controller.abort();
  }, [queryString, refreshTick]);

  async function refreshDeals() {
    setIsRefreshing(true);
    setNotifyMessage(null);

    try {
      const response = await fetch("/api/refresh", {
        method: "POST",
      });
      const result = (await response.json()) as { count?: number; message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? "No se pudo actualizar la cache.");
      }

      setNotifyMessage(
        `Ofertas actualizadas. Se detectaron ${result.count ?? 0} juegos.`,
      );
      setRefreshTick((current) => current + 1);
    } catch (refreshError) {
      setNotifyMessage(
        refreshError instanceof Error
          ? refreshError.message
          : "No se pudieron actualizar las ofertas.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function notifyDiscord() {
    setIsNotifying(true);
    setNotifyMessage(null);

    try {
      const response = await fetch(`/api/notify-discord?${queryString}`, {
        method: "POST",
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? "No se pudo enviar el resumen.");
      }

      setNotifyMessage(result.message ?? "Resumen enviado a Discord.");
    } catch (notifyError) {
      setNotifyMessage(
        notifyError instanceof Error
          ? notifyError.message
          : "No se pudo enviar el resumen a Discord.",
      );
    } finally {
      setIsNotifying(false);
    }
  }

  async function refreshSteamPrices() {
    setIsRefreshingSteam(true);
    setNotifyMessage(null);

    try {
      const response = await fetch(`/api/refresh-steam?${queryString}&limit=50`, {
        method: "POST",
      });
      const result = (await response.json()) as {
        matched?: number;
        scanned?: number;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.message ?? "No se pudo actualizar Steam.");
      }

      setNotifyMessage(
        `Steam actualizado: ${result.matched ?? 0} matches sobre ${
          result.scanned ?? 0
        } juegos revisados.`,
      );
      setRefreshTick((current) => current + 1);
    } catch (steamError) {
      setNotifyMessage(
        steamError instanceof Error
          ? steamError.message
          : "No se pudieron actualizar precios de Steam.",
      );
    } finally {
      setIsRefreshingSteam(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-zinc-800 bg-[radial-gradient(circle_at_top_left,#22c55e22,transparent_34%),linear-gradient(135deg,#09090b,#111827_48%,#18181b)] p-5 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-300">
                Microsoft Store Argentina
              </p>
              <h1 className="mt-3 text-4xl font-black text-zinc-50 sm:text-6xl">
                Xbox Deals AR
              </h1>
              <p className="mt-3 max-w-2xl text-base text-zinc-300 sm:text-lg">
                Detector de ofertas baratas de Xbox y Microsoft Store Argentina
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <button
                type="button"
                onClick={notifyDiscord}
                disabled={isNotifying || isLoading}
                className="min-h-11 rounded-md bg-emerald-400 px-4 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isNotifying ? "Enviando..." : "Enviar resumen a Discord"}
              </button>
              <details className="group relative">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-md border border-zinc-700 px-4 text-sm font-bold text-zinc-200 transition hover:border-emerald-400 hover:text-emerald-200 marker:hidden">
                  Herramientas
                </summary>
                <div className="mt-2 grid gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-2 shadow-xl sm:absolute sm:right-0 sm:z-10 sm:w-56">
                  <button
                    type="button"
                    onClick={refreshDeals}
                    disabled={isRefreshing || isLoading}
                    className="min-h-10 rounded-md border border-emerald-400/40 px-3 text-sm font-bold text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRefreshing ? "Actualizando..." : "Actualizar ofertas"}
                  </button>
                  <button
                    type="button"
                    onClick={refreshSteamPrices}
                    disabled={isRefreshingSteam || isLoading}
                    className="min-h-10 rounded-md border border-sky-400/40 px-3 text-sm font-bold text-sky-200 transition hover:border-sky-300 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRefreshingSteam ? "Buscando Steam..." : "Actualizar Steam"}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </header>

        {notifyMessage ? (
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {notifyMessage}
          </div>
        ) : null}

        <StatsBar
          stats={
            data?.stats ?? {
              total: 0,
            }
          }
        />

        <Filters
          filters={filters}
          sort={sort}
          onFiltersChange={changeFilters}
          onSortChange={changeSort}
        />

        {isLoading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {!isLoading && !error ? (
          <>
            <PaginationBar
              page={data?.page ?? page}
              pageSize={data?.pageSize ?? pageSize}
              total={data?.total ?? 0}
              totalPages={data?.totalPages ?? 1}
              hasPreviousPage={data?.hasPreviousPage ?? false}
              hasNextPage={data?.hasNextPage ?? false}
              onPageChange={setPage}
              onPageSizeChange={changePageSize}
            />
            <DealsGrid deals={data?.deals ?? []} />
            <PaginationBar
              page={data?.page ?? page}
              pageSize={data?.pageSize ?? pageSize}
              total={data?.total ?? 0}
              totalPages={data?.totalPages ?? 1}
              hasPreviousPage={data?.hasPreviousPage ?? false}
              hasNextPage={data?.hasNextPage ?? false}
              onPageChange={setPage}
              onPageSizeChange={changePageSize}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}

function PaginationBar({
  page,
  pageSize,
  total,
  totalPages,
  hasPreviousPage,
  hasNextPage,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const firstVisible = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisible = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-zinc-300">
        Mostrando{" "}
        <span className="font-semibold text-zinc-50">
          {firstVisible}-{lastVisible}
        </span>{" "}
        de <span className="font-semibold text-zinc-50">{total}</span> resultados
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          Por pagina
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="min-h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100 outline-none focus:border-emerald-400"
          >
            <option value={30}>30</option>
            <option value={60}>60</option>
            <option value={90}>90</option>
            <option value={120}>120</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={!hasPreviousPage}
          className="min-h-9 rounded-md border border-zinc-700 px-3 text-sm font-medium text-zinc-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Anterior
        </button>
        <span className="px-2 text-sm text-zinc-400">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={!hasNextPage}
          className="min-h-9 rounded-md border border-zinc-700 px-3 text-sm font-medium text-zinc-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-96 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900"
        />
      ))}
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-400/30 bg-red-950/40 p-5 text-red-100">
      <h2 className="font-semibold">Error al cargar ofertas</h2>
      <p className="mt-1 text-sm text-red-200">{message}</p>
    </div>
  );
}

function buildQueryString(
  filters: DealFilters,
  sort: SortOption,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams();

  if (filters.maxPrice !== undefined) {
    params.set("maxPrice", String(filters.maxPrice));
  }

  if (filters.minDiscount !== undefined) {
    params.set("minDiscount", String(filters.minDiscount));
  }

  if (filters.platform) {
    params.set("platform", filters.platform);
  }

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.hideGamePass) {
    params.set("hideGamePass", "true");
  }

  if (filters.onlyGamePass) {
    params.set("onlyGamePass", "true");
  }

  if (filters.hideFree) {
    params.set("hideFree", "true");
  }

  if (filters.onlyDiscounted) {
    params.set("onlyDiscounted", "true");
  }

  if (filters.contentType && filters.contentType !== "all") {
    params.set("contentType", filters.contentType);
  }

  if (filters.categories.length > 0) {
    params.set("categories", filters.categories.join(","));
  }

  if (filters.modes.length > 0) {
    params.set("modes", filters.modes.join(","));
  }

  params.set("sort", sort);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  return params.toString();
}
