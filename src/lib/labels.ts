import type { DealContentType, GameCategory, GameMode, Platform } from "./types";

export const platformLabels: Record<Platform, string> = {
  xbox: "Xbox",
  pc: "PC",
  "play-anywhere": "Xbox + PC",
  unknown: "Desconocida",
};

export const categoryLabels: Record<GameCategory, string> = {
  action: "Accion",
  adventure: "Aventura",
  rpg: "RPG",
  shooter: "Shooter",
  sports: "Deportes",
  racing: "Carreras",
  strategy: "Estrategia",
  simulation: "Simulacion",
  horror: "Terror",
  platformer: "Plataformas",
  fighting: "Pelea",
  puzzle: "Puzzle",
  indie: "Indie",
  family: "Familiar",
  unknown: "Sin categoria",
};

export const modeLabels: Record<GameMode, string> = {
  "single-player": "Single-player",
  "local-coop": "Coop local",
  "online-coop": "Coop online",
  "local-multiplayer": "Multijugador local",
  "online-multiplayer": "Multijugador online",
  "cross-platform": "Cross-platform",
  unknown: "Sin modo",
};

export const contentTypeLabels: Record<DealContentType, string> = {
  "base-game": "Juego base",
  bundle: "Bundle",
  edition: "Edicion",
  "add-on": "DLC / add-on",
  unknown: "Tipo sin dato",
};

export function formatArs(value?: number): string {
  if (value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function formatMoney(value?: number, currency = "USD"): string {
  if (value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
