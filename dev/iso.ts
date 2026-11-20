// Dev page: the oauth-login example played end to end from its storyboard by
// the beat builder. Each scene is drawn on its own layer, framed to its own
// nodes, and the layers crossfade between scenes.
//   ?t=4.5      a still at 4.5 s instead of playing
//   ?fallback   moves "user" by hand, so "click" takes the fallback route
//   ?palette=ocean&mode=dark&font=barlow   another theme; the example's config by default
//   ?size=L     caption size S, M or L;  ?captions=off  no step or narration captions
import configJson from "../examples/oauth-login/config.json" with { type: "json" };
import graphJson from "../examples/oauth-login/graph.json" with { type: "json" };
import layoutJson from "../examples/oauth-login/layout.json" with { type: "json" };
import storyboardJson from "../examples/oauth-login/storyboard.json" with { type: "json" };
import {
  type BeatPlan,
  buildBeats,
  type ScenePlan,
  sceneTarget,
  scoped,
} from "../src/engine/beats/build.ts";
import { edgeRoutes } from "../src/engine/edges/fallback.ts";
import { edgeGeometry } from "../src/engine/edges/geometry.ts";
import { renderEdges } from "../src/engine/edges/svg.ts";
import { fitView } from "../src/engine/iso/frame.ts";
import { project, type View } from "../src/engine/iso/project.ts";
import { buildScene, type Scene } from "../src/engine/iso/scene.ts";
import { renderScene } from "../src/engine/iso/svg.ts";
import { nodeTarget, zoneTarget } from "../src/engine/iso/tweens.ts";
import { type OverlayDrawing, renderOverlays } from "../src/engine/overlays/html.ts";
import { stageRegions } from "../src/engine/overlays/regions.ts";
import { applyTheme, loadFont } from "../src/engine/theme/apply.ts";
import { fontFor } from "../src/engine/theme/fonts.ts";
import { DEFAULT_CATEGORY } from "../src/engine/theme/kinds.ts";
import type { ThemeMode } from "../src/engine/theme/palettes.ts";
import { themeFor } from "../src/engine/theme/theme.ts";
import { type State, timeline } from "../src/engine/timeline.ts";
import { CAPTION_SIZES, parseConfig } from "../src/schema/config.ts";
import { formatErrors, type Validated } from "../src/schema/errors.ts";
import { type Graph, parseGraph } from "../src/schema/graph.ts";
import { type Layout, parseLayout } from "../src/schema/layout.ts";
import { parseStoryboard } from "../src/schema/storyboard.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

const unwrap = <T>(result: Validated<T>, file: string): T => {
  if (!result.ok) throw new Error(`${file}:\n${formatErrors(result.errors).join("\n")}`);
  return result.value;
};

const params = new URLSearchParams(location.search);
const frame = document.querySelector<HTMLElement>(".frame");
if (!frame) throw new Error("missing .frame");
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
const plan: BeatPlan = buildBeats(storyboard, graph);

/** The graph cut down to one scene: its nodes, and the edges it flows. */
const sceneGraph = (scene: ScenePlan): Graph => {
  const nodes = new Set(scene.nodes);
  const edges = new Set(scene.edges);
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => nodes.has(n.id)),
    edges: graph.edges.filter((e) => edges.has(e.id)),
  };
};

/** Frames a scene's nodes, zones and routes into the content region. */
const framed = (scene: ScenePlan, cut: Graph): { view: View; shape: Scene } => {
  const positions = Object.fromEntries(
    scene.nodes.flatMap((id) => {
      const at = layout.positions[id];
      return at ? [[id, at]] : [];
    }),
  );
  const shapeAt = (view: View) => unwrap(buildScene(cut, positions, view), `scene ${scene.id}`);
  const unitView = { scale: 1, originX: 0, originY: 0 };
  const unit = shapeAt(unitView);
  const view = fitView(
    [
      ...unit.nodes.flatMap((n) => [...n.faces.top, ...n.faces.left, ...n.faces.right]),
      ...unit.zones.flatMap((z) => z.polygon),
      ...scene.edges.flatMap((id) =>
        (routes[id] ?? []).map((p) => project({ x: p.x, y: p.y, z: 0 }, unitView)),
      ),
    ],
    regions.content,
  );
  return { view, shape: shapeAt(view) };
};

/** Draws one scene on its own layer and returns the function that poses it. */
const drawScene = (scene: ScenePlan): ((state: State) => void) => {
  const layer = document.createElement("div");
  layer.className = "scene-layer";
  layer.dataset.scene = scene.id;
  const stage = document.createElementNS(SVG_NS, "svg");
  stage.setAttribute("class", "stage");
  stage.setAttribute("viewBox", "0 0 1920 1080");
  const overlayRoot = document.createElement("div");
  overlayRoot.className = "overlays";
  layer.append(stage, overlayRoot);
  frame.appendChild(layer);

  const cut = sceneGraph(scene);
  const { view, shape } = framed(scene, cut);
  const applyNodes = renderScene(stage, shape, {
    node: (id) => nodeTarget(scoped(scene.id, id)),
    zone: (id) => zoneTarget(scoped(scene.id, id)),
  });

  const occluders = shape.nodes.flatMap((n) => [n.faces.top, n.faces.left, n.faces.right]);
  const lines = stage.querySelector<SVGGElement>(".edges");
  const labels = stage.querySelector<SVGGElement>(".edge-labels");
  if (!lines || !labels) throw new Error("missing edge layers");
  const applyEdges = renderEdges(
    { lines, labels },
    cut.edges.map((edge) => {
      const label = scene.edgeLabels[edge.id] ?? edge.label;
      return {
        id: scoped(scene.id, edge.id),
        geometry: edgeGeometry(routes[edge.id] ?? [], view, occluders),
        ...(label === undefined ? {} : { label }),
        category: edge.category ?? DEFAULT_CATEGORY,
      };
    }),
  );

  const shapes = new Map(shape.nodes.map((n) => [n.id, n]));
  const shapeOf = (id: string) => {
    const node = shapes.get(id);
    if (!node) throw new Error(`no shape for node "${id}" in scene "${scene.id}"`);
    return node;
  };
  const overlays = plan.overlays
    .filter((o) => o.scene === scene.id)
    .map((o): OverlayDrawing => {
      const shown = { at: o.at, until: o.until };
      switch (o.kind) {
        case "callout": {
          const node = shapeOf(o.node);
          return {
            kind: "callout",
            id: o.id,
            shown,
            node: node.faces,
            text: o.text,
            category: node.category,
            ...(o.title === undefined ? {} : { title: o.title }),
          };
        }
        case "badge":
          return {
            kind: "badge",
            id: o.id,
            shown,
            node: shapeOf(o.node).faces,
            text: o.text,
            tone: o.tone,
          };
        default:
          return { kind: o.kind, id: o.id, shown, text: o.text };
      }
    });
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

  return (state) => {
    const opacity = state[sceneTarget(scene.id)]?.opacity ?? 1;
    layer.style.visibility = opacity > 0 ? "visible" : "hidden";
    layer.style.opacity = opacity.toFixed(3);
    if (opacity <= 0) return;
    applyNodes(state);
    applyEdges(state);
    applyOverlays(state);
  };
};

const posers = plan.scenes.map(drawScene);
const tl = plan.tweens.reduce((builder, tween) => builder.add(tween), timeline()).build();

const seek = (t: number): void => {
  const state = tl.seek(t);
  for (const pose of posers) pose(state);
};
Object.assign(window, {
  __seek: seek,
  __duration: plan.duration,
  __cues: plan.cues.map(({ start, end, text }) => ({ start, end, text })),
});

const still = params.get("t");
if (still !== null) {
  seek(Number(still));
} else {
  // Plays in real time for a person watching, holding the end for a second
  // before looping. Capture seeks instead.
  const started = performance.now();
  const play = (): void => {
    seek(((performance.now() - started) / 1000) % (plan.duration + 1));
    requestAnimationFrame(play);
  };
  play();
}
document.body.dataset.ready = "true";
