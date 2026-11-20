import type { THEME_MODES } from "../../schema/config.ts";
import type { PaletteColours } from "./dark.ts";

/** One rendered look. `config.theme.mode` "both" renders each in turn. */
export type ThemeMode = Exclude<(typeof THEME_MODES)[number], "both">;

export type Preset = Readonly<Record<ThemeMode, PaletteColours>>;

/**
 * The palettes a project can name in `config.theme.palette`. Each has six
 * category colours and a hand-picked dark variant; the tests hold every one
 * to the same contrast as a generated dark palette.
 */
export const PALETTES: Readonly<Record<string, Preset>> = {
  default: {
    light: {
      background: "#f6f7fb",
      surface: "#ffffff",
      text: "#18181b",
      muted: "#5f6472",
      accent: "#6d28d9",
      categories: ["#2563eb", "#0f766e", "#b45309", "#be185d", "#0369a1", "#4d7c0f"],
    },
    dark: {
      background: "#0f1220",
      surface: "#1d2236",
      text: "#eef0f7",
      muted: "#a3a9bc",
      accent: "#a78bfa",
      categories: ["#60a5fa", "#2dd4bf", "#fbbf24", "#f472b6", "#38bdf8", "#a3e635"],
    },
  },
  ocean: {
    light: {
      background: "#f4f7fc",
      surface: "#ffffff",
      text: "#122991",
      muted: "#56668a",
      accent: "#2f74d0",
      categories: ["#7b3fe4", "#0e7f76", "#c2410c", "#4a78b0", "#a16207", "#0369a1"],
    },
    dark: {
      background: "#101828",
      surface: "#22304b",
      text: "#e4f0ff",
      muted: "#aab6cc",
      accent: "#5b9bf0",
      categories: ["#a77bf5", "#2cc4b8", "#f2a050", "#7fa9db", "#facc15", "#38bdf8"],
    },
  },
  forest: {
    light: {
      background: "#f5f7f2",
      surface: "#ffffff",
      text: "#1c2a1e",
      muted: "#56635a",
      accent: "#15803d",
      categories: ["#0f766e", "#a16207", "#4338ca", "#be123c", "#0e7490", "#4d7c0f"],
    },
    dark: {
      background: "#0f1a12",
      surface: "#1c2b20",
      text: "#e8f2ea",
      muted: "#a3b5a7",
      accent: "#4ade80",
      categories: ["#2dd4bf", "#facc15", "#a5b4fc", "#fb7185", "#22d3ee", "#a3e635"],
    },
  },
  sunset: {
    light: {
      background: "#fdf7f2",
      surface: "#ffffff",
      text: "#2a1a14",
      muted: "#735b51",
      accent: "#c2410c",
      categories: ["#be185d", "#7c3aed", "#b45309", "#0f766e", "#1d4ed8", "#9f1239"],
    },
    dark: {
      background: "#1c120e",
      surface: "#2d1f19",
      text: "#fbefe7",
      muted: "#c4ada0",
      accent: "#fb923c",
      categories: ["#f472b6", "#c4b5fd", "#fbbf24", "#5eead4", "#93c5fd", "#fda4af"],
    },
  },
  slate: {
    light: {
      background: "#f8fafc",
      surface: "#ffffff",
      text: "#0f172a",
      muted: "#5b6578",
      accent: "#1e293b",
      categories: ["#475569", "#2563eb", "#0e7490", "#334155", "#1e40af", "#0f766e"],
    },
    dark: {
      background: "#0b1120",
      surface: "#1e293b",
      text: "#f1f5f9",
      muted: "#94a3b8",
      accent: "#e2e8f0",
      categories: ["#cbd5e1", "#60a5fa", "#22d3ee", "#94a3b8", "#93c5fd", "#5eead4"],
    },
  },
  candy: {
    light: {
      background: "#fbf7ff",
      surface: "#ffffff",
      text: "#2e1065",
      muted: "#66577f",
      accent: "#db2777",
      categories: ["#7c3aed", "#0e7490", "#c2410c", "#15803d", "#c026d3", "#2563eb"],
    },
    dark: {
      background: "#180b2a",
      surface: "#2a1745",
      text: "#f7f0ff",
      muted: "#bba9d6",
      accent: "#f472b6",
      categories: ["#c4b5fd", "#67e8f9", "#fdba74", "#86efac", "#f0abfc", "#93c5fd"],
    },
  },
};
