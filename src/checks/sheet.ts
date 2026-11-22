import { type BeatWarning, STAGE } from "../schema/checks.ts";

/** A beat's place in the video, as the page and the plan give it. */
type BeatSpan = {
  readonly id: string;
  readonly scene: string;
  readonly start: number;
  readonly end: number;
};

/** Tiles to a row: a 10-beat video fits on three rows. */
const COLUMNS = 4;
/** Space around and between tiles, and the label band under each, in pixels. */
const GAP = 16;
const LABEL_HEIGHT = 36;

export type SheetTile = {
  readonly beat: string;
  readonly scene: string;
  /** The moment shown: the beat's midpoint, where the checks look too. */
  readonly at: number;
  readonly column: number;
  readonly row: number;
  readonly label: string;
  /** How many warnings the checks found at this beat. */
  readonly warnings: number;
};

export type SheetLayout = {
  readonly columns: number;
  readonly rows: number;
  readonly tile: { readonly width: number; readonly height: number };
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly SheetTile[];
};

/**
 * The contact sheet (SPEC, Checks): one tile per beat, in order, four to a
 * row, each the stage's shape and labelled with its number, scene, beat and
 * time; a tile is marked with the warnings found at its beat.
 */
export const sheetLayout = ({
  beats,
  warnings,
  tileWidth,
}: {
  readonly beats: readonly BeatSpan[];
  readonly warnings: readonly BeatWarning[];
  readonly tileWidth: number;
}): SheetLayout => {
  const tile = { width: tileWidth, height: Math.round((tileWidth * STAGE.height) / STAGE.width) };
  const columns = Math.min(COLUMNS, Math.max(1, beats.length));
  const rows = Math.ceil(beats.length / columns);
  const tiles = beats.map((beat, i): SheetTile => {
    const at = (beat.start + beat.end) / 2;
    return {
      beat: beat.id,
      scene: beat.scene,
      at,
      column: i % columns,
      row: Math.floor(i / columns),
      label: `${i + 1} · ${beat.scene}/${beat.id} · ${at.toFixed(1)} s`,
      warnings: warnings.filter((w) => w.beat === beat.id).length,
    };
  });
  return {
    columns,
    rows,
    tile,
    width: GAP + columns * (tile.width + GAP),
    height: GAP + rows * (tile.height + LABEL_HEIGHT + GAP),
    tiles,
  };
};

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The sheet as a page for Chrome to lay out and capture: each still (a data
 * URL, in tile order) with its label, and a red outline and count on a tile
 * with warnings.
 */
export const sheetHtml = (sheet: SheetLayout, stills: readonly string[]): string => {
  const tiles = sheet.tiles
    .map((tile, i) => {
      const left = GAP + tile.column * (sheet.tile.width + GAP);
      const top = GAP + tile.row * (sheet.tile.height + LABEL_HEIGHT + GAP);
      const count = tile.warnings === 1 ? "1 warning" : `${tile.warnings} warnings`;
      return `<div class="${tile.warnings > 0 ? "tile warned" : "tile"}" style="left: ${left}px; top: ${top}px">
  <img src="${escapeHtml(stills[i] ?? "")}" alt="">
  <div class="label">${escapeHtml(tile.label)}${tile.warnings > 0 ? ` <b>${count}</b>` : ""}</div>
</div>`;
    })
    .join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: #f4f4f6; }
  body { position: relative; width: ${sheet.width}px; height: ${sheet.height}px;
    font: 500 16px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d1d24; }
  .tile { position: absolute; width: ${sheet.tile.width}px; }
  .tile img { display: block; width: ${sheet.tile.width}px; height: ${sheet.tile.height}px;
    border-radius: 6px; outline: 1px solid #d6d6de; }
  .tile.warned img { outline: 3px solid #d93838; }
  .label { height: ${LABEL_HEIGHT}px; display: flex; align-items: center; gap: 8px; }
  .label b { color: #d93838; font-weight: 700; }
</style></head><body>
${tiles}
</body></html>`;
};
