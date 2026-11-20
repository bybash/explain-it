// Dev page: the oauth-login example played end to end by the player, the same
// code the render page captures. URL parameters change the example's config:
//   ?t=4.5      a still at 4.5 s instead of playing
//   ?fallback   moves "user" by hand, so "click" takes the fallback route
//   ?palette=ocean&mode=dark&font=barlow   another theme; the example's config by default
//   ?size=L     caption size S, M or L;  ?captions=off  no step or narration captions
//   ?logo=all   the logo on every frame;  ?logo=bottom  in the bottom-right corner;  ?card=off  no title card
import configJson from "../examples/oauth-login/config.json" with { type: "json" };
import graphJson from "../examples/oauth-login/graph.json" with { type: "json" };
import layoutJson from "../examples/oauth-login/layout.json" with { type: "json" };
import storyboardJson from "../examples/oauth-login/storyboard.json" with { type: "json" };
import { expose, mountPlayer } from "../src/engine/player.ts";
import { CAPTION_SIZES, type Config, parseConfig } from "../src/schema/config.ts";
import { orThrow } from "../src/schema/errors.ts";
import { parseGraph } from "../src/schema/graph.ts";
import { type Layout, parseLayout } from "../src/schema/layout.ts";
import { parseStoryboard } from "../src/schema/storyboard.ts";

const params = new URLSearchParams(location.search);
const frame = document.querySelector<HTMLElement>(".frame");
if (!frame) throw new Error("missing .frame");
const graph = orThrow(parseGraph(graphJson), "graph.json");
const storyboard = orThrow(parseStoryboard(storyboardJson, graph), "storyboard.json");

const example = orThrow(parseConfig(configJson), "config.json");
const captionsOn = params.get("captions") !== "off";
const logoParam = params.get("logo");
const config: Config = {
  ...example,
  ...(example.logo
    ? {
        logo: {
          ...example.logo,
          ...(logoParam === "all" ? { show: "all" as const } : {}),
          ...(logoParam === "bottom"
            ? { show: "all" as const, corner: "bottom-right" as const }
            : {}),
        },
      }
    : {}),
  ...(params.get("card") === "off" ? { cards: {} } : {}),
  theme: { ...example.theme, palette: params.get("palette") ?? example.theme.palette },
  font: params.get("font") ?? example.font,
  captions: {
    size: CAPTION_SIZES.find((s) => s === params.get("size")) ?? example.captions.size,
    step: captionsOn && example.captions.step,
    narration: captionsOn && example.captions.narration,
  },
};

/** The example with "user" moved by hand: layout drops its route, as layoutGraph would. */
const withMovedUser = (layout: Layout): Layout => {
  const moved = { x: 0, y: 9 };
  return {
    ...layout,
    positions: { ...layout.positions, user: moved },
    overrides: { user: moved },
    routes: { ...layout.routes, click: null },
  };
};
const computed = orThrow(parseLayout(layoutJson, graph), "layout.json");
const layout = orThrow(
  parseLayout(params.has("fallback") ? withMovedUser(computed) : computed, graph),
  "layout",
);

/** The example's logo files, served by Vite; one file serves both modes. */
const asset = (name: string) =>
  new URL(`../examples/oauth-login/assets/${name}`, import.meta.url).href;
const logoFiles = config.logo;
const logoFile = logoFiles?.light ?? logoFiles?.dark;
const logo =
  logoFiles && logoFile
    ? { light: asset(logoFiles.light ?? logoFile), dark: asset(logoFiles.dark ?? logoFile) }
    : undefined;

const player = await mountPlayer(frame, {
  graph,
  storyboard,
  layout,
  config,
  mode: params.get("mode") === "dark" ? "dark" : "light",
  // Vite rewrites a folder URL made from import.meta.url, so resolve it from the page.
  fonts: new URL("/assets/fonts/", location.href),
  ...(logo ? { logo } : {}),
});
expose(player);

const still = params.get("t");
if (still !== null) {
  player.seek(Number(still));
} else {
  // Plays in real time for a person watching, holding the end for a second
  // before looping. Capture seeks instead.
  const started = performance.now();
  const play = (): void => {
    player.seek(((performance.now() - started) / 1000) % (player.duration + 1));
    requestAnimationFrame(play);
  };
  play();
}
document.body.dataset.ready = "true";
