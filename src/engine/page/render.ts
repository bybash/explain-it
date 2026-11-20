// The page the renderer captures. The CLI puts the project's files on
// `window.__project` before the page loads; the page validates them, draws
// them and exposes `__seek`, `__duration` and `__cues`, then sets
// `data-ready` on the body. Errors go on `data-error` so the capture can
// report them.

import { parseConfig } from "../../schema/config.ts";
import { orThrow } from "../../schema/errors.ts";
import { parseGraph } from "../../schema/graph.ts";
import { parseLayout } from "../../schema/layout.ts";
import { parseStoryboard } from "../../schema/storyboard.ts";
import type { LogoImages } from "../cards/html.ts";
import { expose, mountPlayer } from "../player.ts";
import type { ThemeMode } from "../theme/palettes.ts";

/** What the renderer injects: the project's JSON files as read, and the theme mode. */
export type InjectedProject = {
  readonly graph: unknown;
  readonly storyboard: unknown;
  readonly layout: unknown;
  readonly config: unknown;
  /** The logo's files as data URLs, when the config has a logo. */
  readonly logo?: unknown;
  readonly mode: ThemeMode;
};

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

/** The injected logo, checked again at this edge: images as data URLs, or nothing. */
const logoImages = (logo: unknown): LogoImages | undefined => {
  if (logo === undefined) return undefined;
  const { light, dark } = (logo ?? {}) as Record<string, unknown>;
  for (const [mode, url] of Object.entries({ light, dark }))
    if (typeof url !== "string" || !IMAGE_DATA_URL.test(url))
      throw new Error(`logo.${mode}: must be a PNG, JPG or SVG data URL`);
  return { light: light as string, dark: dark as string };
};

const start = async (): Promise<void> => {
  const injected = (window as { __project?: InjectedProject }).__project;
  if (!injected) throw new Error("no project: the renderer sets window.__project");
  const frame = document.querySelector<HTMLElement>(".frame");
  if (!frame) throw new Error("missing .frame");
  const graph = orThrow(parseGraph(injected.graph), "graph.json");
  const logo = logoImages(injected.logo);
  const player = await mountPlayer(frame, {
    graph,
    storyboard: orThrow(parseStoryboard(injected.storyboard, graph), "storyboard.json"),
    layout: orThrow(parseLayout(injected.layout, graph), "layout.json"),
    config: orThrow(parseConfig(injected.config), "config.json"),
    mode: injected.mode,
    fonts: new URL("/assets/fonts/", location.href),
    ...(logo ? { logo } : {}),
  });
  expose(player);
  player.seek(0);
  document.body.dataset.ready = "true";
};

start().catch((error: unknown) => {
  document.body.dataset.error = error instanceof Error ? error.message : String(error);
});
