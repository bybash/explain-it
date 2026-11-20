// Dev page: the oauth-login example drawn from its computed layout.json, with
// its storyboard played beat by beat on one timeline: flows, callouts, badges,
// captions and scene titles. Nodes stay on screen throughout; appear, highlight,
// dim and per-scene framing come with the beat builder (slice 1.8).
//   ?t=4.5      a still at 4.5 s instead of playing
//   ?fallback   moves "user" by hand, so "click" takes the fallback route
//   ?palette=ocean&mode=dark&font=barlow   another theme; the example's config by default
//   ?size=L     caption size S, M or L;  ?captions=off  no step or narration captions
import configJson from "../examples/oauth-login/config.json" with { type: "json" };
import graphJson from "../examples/oauth-login/graph.json" with { type: "json" };
import layoutJson from "../examples/oauth-login/layout.json" with { type: "json" };
import storyboardJson from "../examples/oauth-login/storyboard.json" with { type: "json" };
import { edgeRoutes } from "../src/engine/edges/fallback.ts";
import { EDGE_TIMING, flowTweens } from "../src/engine/edges/flow.ts";
import { edgeGeometry } from "../src/engine/edges/geometry.ts";
import { renderEdges } from "../src/engine/edges/svg.ts";
import { project, type View } from "../src/engine/iso/project.ts";
import { buildScene, type Scene } from "../src/engine/iso/scene.ts";
import { renderScene } from "../src/engine/iso/svg.ts";
import {
  type OverlayDrawing,
  renderOverlays,
  sceneTitleText,
} from "../src/engine/overlays/html.ts";
import { stageRegions } from "../src/engine/overlays/regions.ts";
import { type Entrance, overlayTweens } from "../src/engine/overlays/tweens.ts";
import { applyTheme, loadFont } from "../src/engine/theme/apply.ts";
import { fontFor } from "../src/engine/theme/fonts.ts";
import { DEFAULT_CATEGORY } from "../src/engine/theme/kinds.ts";
import type { ThemeMode } from "../src/engine/theme/palettes.ts";
import { themeFor } from "../src/engine/theme/theme.ts";
import { type TweenSpec, timeline } from "../src/engine/timeline.ts";
import { CAPTION_SIZES, parseConfig } from "../src/schema/config.ts";
import { formatErrors, type Validated } from "../src/schema/errors.ts";
import { parseGraph } from "../src/schema/graph.ts";
import { type Layout, parseLayout } from "../src/schema/layout.ts";
import { parseStoryboard } from "../src/schema/storyboard.ts";

/** A fixed length for every beat; slice 1.8 times beats from their narration. */
const BEAT = 4.5;
/** Seconds between flows in one beat. */
const FLOW_GAP = 0.9;
/** Seconds the last beat holds before the clip ends. */
const TAIL = 1.5;

const unwrap = <T>(result: Validated<T>, file: string): T => {
  if (!result.ok) throw new Error(`${file}:\n${formatErrors(result.errors).join("\n")}`);
  return result.value;
};

const params = new URLSearchParams(location.search);
const stage = document.querySelector<SVGSVGElement>("#stage");
const overlayRoot = document.querySelector<HTMLElement>("#overlays");
if (!stage || !overlayRoot) throw new Error("missing #stage or #overlays");
const graph = unwrap(parseGraph(graphJson), "graph.json");
const config = unwrap(parseConfig(configJson), "config.json");
const storyboard = unwrap(parseStoryboard(storyboardJson, graph), "storyboard.json");
const size = CAPTION_SIZES.find((s) => s === params.get("size")) ?? config.captions.size;
const captionsOn = params.get("captions") !== "off";
const regions = stageRegions({
  size,
  step: captionsOn && config.captions.step,
  narration: captionsOn && config.captions.narration,
});

const mode: ThemeMode = params.get("mode") === "dark" ? "dark" : "light";
const theme = unwrap(themeFor(params.get("palette") ?? config.theme.palette, mode), "theme");
const font = unwrap(fontFor(params.get("font") ?? config.font), "font");
applyTheme(document.documentElement, theme, font);
// Vite rewrites a folder URL made from import.meta.url, so resolve it from the page.
await loadFont(font, new URL("/assets/fonts/", location.href));

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
const computed = unwrap(parseLayout(layoutJson, graph), "layout.json");
const layout = unwrap(
  parseLayout(params.has("fallback") ? withMovedUser(computed) : computed, graph),
  "layout",
);
const routes = edgeRoutes(graph, layout);

const sceneAt = (view: View): Scene => unwrap(buildScene(graph, layout.positions, view), "scene");

/** Fits nodes, zones and routes into the content region. Per-scene framing is slice 1.8's job. */
const frameAll = (): View => {
  const unitView = { scale: 1, originX: 0, originY: 0 };
  const unit = sceneAt(unitView);
  const points = [
    ...unit.nodes.flatMap((n) => [...n.faces.top, ...n.faces.left, ...n.faces.right]),
    ...unit.zones.flatMap((z) => z.polygon),
    ...Object.values(routes).flatMap((route) =>
      route.map((p) => project({ x: p.x, y: p.y, z: 0 }, unitView)),
    ),
  ];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const { content } = regions;
  const scale = Math.min(content.width / (maxX - minX), content.height / (maxY - minY));
  return {
    scale,
    originX: content.x + content.width / 2 - ((minX + maxX) / 2) * scale,
    originY: content.y + content.height / 2 - ((minY + maxY) / 2) * scale,
  };
};

const view = frameAll();
const scene = sceneAt(view);
renderScene(stage, scene);

const occluders = scene.nodes.flatMap((n) => [n.faces.top, n.faces.left, n.faces.right]);
const lines = stage.querySelector<SVGGElement>(".edges");
const labels = stage.querySelector<SVGGElement>(".edge-labels");
if (!lines || !labels) throw new Error("missing edge layers");
const apply = renderEdges(
  { lines, labels },
  graph.edges.map((edge) => ({
    id: edge.id,
    geometry: edgeGeometry(routes[edge.id] ?? [], view, occluders),
    ...(edge.label === undefined ? {} : { label: edge.label }),
    category: edge.category ?? DEFAULT_CATEGORY,
  })),
);

const nodeShapes = new Map(scene.nodes.map((n) => [n.id, n]));
const facesOf = (id: string) => {
  const node = nodeShapes.get(id);
  if (!node) throw new Error(`no shape for node "${id}"`);
  return node;
};

const beats = storyboard.scenes.flatMap((s, sceneIndex) =>
  s.beats.map((beat) => ({ beat, scene: s, sceneIndex })),
);
const end = beats.length * BEAT + TAIL;
const overlays: OverlayDrawing[] = [];
const tweens: TweenSpec[] = [];
const show = (overlay: OverlayDrawing, at: number, until: number, entrance: Entrance) => {
  overlays.push(overlay);
  tweens.push(...overlayTweens(overlay.id, { at, until, entrance }));
};

let beatIndex = 0;
for (const [sceneIndex, s] of storyboard.scenes.entries()) {
  const sceneStart = beatIndex * BEAT;
  const sceneEnd = (beatIndex + s.beats.length) * BEAT;
  show(
    { kind: "title", id: `title_${s.id}`, text: sceneTitleText(sceneIndex, s.title) },
    sceneStart,
    sceneIndex === storyboard.scenes.length - 1 ? end : sceneEnd,
    "fade",
  );
  for (const beat of s.beats) {
    const at = beatIndex * BEAT;
    const beatEnd = at + BEAT;
    show({ kind: "step", id: `step_${beat.id}`, text: beat.caption }, at, beatEnd, "rise");
    if (beat.say)
      show({ kind: "narration", id: `say_${beat.id}`, text: beat.say }, at + 0.2, beatEnd, "fade");
    let flows = 0;
    for (const [a, action] of beat.actions.entries()) {
      const id = `${beat.id}_${a}`;
      if (action.type === "flow") {
        const flowAt = at + 0.3 + flows++ * FLOW_GAP;
        tweens.push(
          ...flowTweens(action.edge, { at: flowAt, flowFor: end - flowAt - EDGE_TIMING.draw }),
        );
      } else if (action.type === "callout") {
        const node = facesOf(action.node);
        show(
          {
            kind: "callout",
            id,
            node: node.faces,
            text: action.text,
            category: node.category,
            ...(action.title === undefined ? {} : { title: action.title }),
          },
          at + 0.5,
          beatEnd,
          "rise",
        );
      } else if (action.type === "badge") {
        show(
          {
            kind: "badge",
            id,
            node: facesOf(action.node).faces,
            text: action.text,
            tone: action.tone,
          },
          at + 0.8,
          sceneEnd,
          "pop",
        );
      }
    }
    beatIndex++;
  }
}

// Callouts keep clear of edge label pills as well as boxes; the pills are already measured.
const pills = [...stage.querySelectorAll<SVGGElement>(".edge-label")].map((pill) => {
  const { x, y, width, height } = pill.getBBox();
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
});
const applyOverlays = renderOverlays(overlayRoot, overlays, regions, [...occluders, ...pills]);
const tl = tweens.reduce((builder, tween) => builder.add(tween), timeline()).build();

const seek = (t: number): void => {
  const state = tl.seek(t);
  apply(state);
  applyOverlays(state);
};
Object.assign(window, { __seek: seek, __duration: tl.duration });

const still = params.get("t");
if (still !== null) {
  seek(Number(still));
} else {
  // Plays in real time for a person watching, holding the end for a second
  // before looping. Capture seeks instead.
  const started = performance.now();
  const play = (): void => {
    seek(((performance.now() - started) / 1000) % (tl.duration + 1));
    requestAnimationFrame(play);
  };
  play();
}
document.body.dataset.ready = "true";
