"use client";

import { categoryLabels, modeLabels } from "@/lib/labels";
import type { DealFilters, GameCategory, GameMode, Platform, SortOption } from "@/lib/types";

const priceOptions = [
  { label: "Sin limite", value: "" },
  { label: "$200", value: "200" },
  { label: "$500", value: "500" },
  { label: "$1000", value: "1000" },
  { label: "$2000", value: "2000" },
  { label: "Personalizado", value: "custom" },
];

const discountOptions = [
  { label: "Sin limite", value: "" },
  { label: "50%", value: "50" },
  { label: "70%", value: "70" },
  { label: "80%", value: "80" },
  { label: "90%", value: "90" },
];

const contentTypeOptions = [
  { label: "Todo el contenido", value: "all" },
  { label: "Solo juegos base", value: "base-games" },
  { label: "Bundles y ediciones", value: "bundles-editions" },
  { label: "DLC / add-ons", value: "add-ons" },
];

const platforms: Array<{ label: string; value: "" | Platform }> = [
  { label: "Todas", value: "" },
  { label: "Jugable en Xbox", value: "xbox" },
  { label: "Jugable en PC", value: "pc" },
  { label: "Xbox y PC / Play Anywhere", value: "play-anywhere" },
];

const categories: GameCategory[] = [
  "action",
  "adventure",
  "rpg",
  "shooter",
  "sports",
  "racing",
  "strategy",
  "simulation",
  "horror",
  "platformer",
  "fighting",
  "puzzle",
  "indie",
  "family",
];

const modes: GameMode[] = [
  "single-player",
  "local-coop",
  "online-coop",
  "local-multiplayer",
  "online-multiplayer",
  "cross-platform",
];

type FiltersProps = {
  filters: DealFilters;
  sort: SortOption;
  onFiltersChange: (filters: DealFilters) => void;
  onSortChange: (sort: SortOption) => void;
};

export function Filters({
  filters,
  sort,
  onFiltersChange,
  onSortChange,
}: FiltersProps) {
  const selectedPrice = getSelectedPrice(filters.maxPrice);
  const activeAdvancedCount = getActiveAdvancedCount(filters);

  function updateFilters(partial: Partial<DealFilters>) {
    onFiltersChange({
      ...filters,
      ...partial,
    });
  }

  function resetFilters() {
    onFiltersChange({
      categories: [],
      modes: [],
      hideGamePass: false,
      onlyGamePass: false,
      hideFree: false,
      onlyDiscounted: false,
      contentType: "all",
    });
  }

  function toggleCategory(category: GameCategory) {
    updateFilters({
      categories: filters.categories.includes(category)
        ? filters.categories.filter((item) => item !== category)
        : [...filters.categories, category],
    });
  }

  function toggleMode(mode: GameMode) {
    updateFilters({
      modes: filters.modes.includes(mode)
        ? filters.modes.filter((item) => item !== mode)
        : [...filters.modes, mode],
    });
  }

  return (
    <aside className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-4 shadow-lg shadow-black/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Filtros</h2>
          <p className="text-sm text-zinc-400">
            Busca rapido por precio, descuento y nombre. El resto queda a mano cuando lo necesites.
          </p>
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="min-h-9 rounded-md border border-zinc-700 px-3 text-sm font-medium text-zinc-200 transition hover:border-emerald-400 hover:text-emerald-200"
        >
          Limpiar
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1.35fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(170px,0.9fr)]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-300">Buscar</span>
          <input
            value={filters.search ?? ""}
            onChange={(event) => updateFilters({ search: event.target.value })}
            placeholder="Ej: DOOM, Ori, coop..."
            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-300">
            Precio maximo
          </span>
          <select
            value={selectedPrice}
            onChange={(event) => {
              const value = event.target.value;
              updateFilters({
                maxPrice:
                  value && value !== "custom" ? Number(value) : filters.maxPrice,
              });
            }}
            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
          >
            {priceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-300">
            Descuento minimo
          </span>
          <select
            value={filters.minDiscount ?? ""}
            onChange={(event) =>
              updateFilters({
                minDiscount: event.target.value
                  ? Number(event.target.value)
                  : undefined,
              })
            }
            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
          >
            {discountOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-300">Ordenar</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortOption)}
            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
          >
            <option value="price-asc">Precio: menor a mayor</option>
            <option value="discount-desc">Descuento: mayor a menor</option>
            <option value="savings-desc">Ahorro: mayor a menor</option>
            <option value="newest">Mas recientes</option>
          </select>
        </label>
      </div>

      <details className="group mt-4 rounded-md border border-zinc-800 bg-zinc-900/40">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-semibold text-zinc-200 marker:hidden">
          <span>
            Filtros avanzados
            {activeAdvancedCount > 0 ? (
              <span className="ml-2 rounded-full bg-emerald-400 px-2 py-0.5 text-xs font-bold text-zinc-950">
                {activeAdvancedCount}
              </span>
            ) : null}
          </span>
          <span className="text-xs text-zinc-500 transition group-open:rotate-180">
            v
          </span>
        </summary>

        <div className="border-t border-zinc-800 p-3">
          <div className="grid gap-3 lg:grid-cols-4">
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-300">
                Precio personalizado
              </span>
              <input
                type="number"
                min="0"
                value={filters.maxPrice ?? ""}
                onChange={(event) =>
                  updateFilters({
                    maxPrice: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  })
                }
                placeholder="Sin limite"
                className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-300">
                Disponibilidad
              </span>
              <select
                value={filters.platform ?? ""}
                onChange={(event) =>
                  updateFilters({
                    platform: (event.target.value || undefined) as
                      | Platform
                      | undefined,
                  })
                }
                className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
              >
                {platforms.map((platform) => (
                  <option key={platform.value} value={platform.value}>
                    {platform.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-300">
                Tipo de contenido
              </span>
              <select
                value={filters.contentType ?? "all"}
                onChange={(event) =>
                  updateFilters({
                    contentType: event.target.value as DealFilters["contentType"],
                  })
                }
                className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
              >
                {contentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-2 sm:grid-cols-2 lg:col-span-1 lg:grid-cols-1">
              <CheckOption
                checked={filters.hideFree ?? false}
                label="Ocultar gratis"
                onChange={(checked) => updateFilters({ hideFree: checked })}
              />
              <CheckOption
                checked={filters.onlyDiscounted ?? false}
                label="Solo con descuento"
                onChange={(checked) => updateFilters({ onlyDiscounted: checked })}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <CheckOption
              checked={filters.hideGamePass ?? false}
              label="Ocultar Game Pass"
              onChange={(checked) =>
                updateFilters({
                  hideGamePass: checked,
                  onlyGamePass: checked ? false : filters.onlyGamePass,
                })
              }
            />
            <CheckOption
              checked={filters.onlyGamePass ?? false}
              label="Solo Game Pass"
              onChange={(checked) =>
                updateFilters({
                  onlyGamePass: checked,
                  hideGamePass: checked ? false : filters.hideGamePass,
                })
              }
            />
          </div>

          <FilterGroup title="Categorias">
            {categories.map((category) => (
              <Chip
                key={category}
                active={filters.categories.includes(category)}
                onClick={() => toggleCategory(category)}
              >
                {categoryLabels[category]}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup title="Modos de juego">
            {modes.map((mode) => (
              <Chip
                key={mode}
                active={filters.modes.includes(mode)}
                onClick={() => toggleMode(mode)}
              >
                {modeLabels[mode]}
              </Chip>
            ))}
          </FilterGroup>
        </div>
      </details>
    </aside>
  );
}

function CheckOption({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-emerald-400"
      />
      <span className="text-sm font-medium text-zinc-200">{label}</span>
    </label>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <p className="mb-3 text-sm font-semibold text-zinc-300">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 text-sm transition ${
        active
          ? "border-emerald-300 bg-emerald-400 text-zinc-950"
          : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-emerald-400 hover:text-emerald-200"
      }`}
    >
      {children}
    </button>
  );
}

function getSelectedPrice(maxPrice?: number): string {
  if (maxPrice === undefined) {
    return "";
  }

  return ["200", "500", "1000", "2000"].includes(String(maxPrice))
    ? String(maxPrice)
    : "custom";
}

function getActiveAdvancedCount(filters: DealFilters): number {
  return [
    filters.platform,
    filters.contentType && filters.contentType !== "all",
    filters.hideGamePass,
    filters.onlyGamePass,
    filters.hideFree,
    filters.onlyDiscounted,
    filters.categories.length > 0,
    filters.modes.length > 0,
  ].filter(Boolean).length;
}
