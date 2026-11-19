// Dev page: the oauth-login example drawn from its computed layout.json, with
// every edge flowing in turn on one timeline.
//   ?t=4.5      a still at 4.5 s instead of playing
//   ?fallback   moves "user" by hand, so "click" takes the fallback route
import graphJson from "../examples/oauth-login/graph.json" with { type: "json" };
import layoutJson from "../examples/oauth-login/layout.json" with { type: "json" };
import { edgeRoutes } from "../src/engine/edges/fallback.ts";
import { EDGE_TIMING, flowTweens } from "../src/engine/edges/flow.ts";
import { edgeGeometry } from "../src/engine/edges/geometry.ts";
import { renderEdges } from "../src/engine/edges/svg.ts";
import { project, type View } from "../src/engine/iso/project.ts";
import { buildScene, type Scene } from "../src/engine/iso/scene.ts";
import { renderScene } from "../src/engine/iso/svg.ts";
import { timeline } from "../src/engine/timeline.ts";
import { formatErrors, type Validated } from "../src/schema/errors.ts";
import { parseGraph } from "../src/schema/graph.ts";
import { type Layout, parseLayout } from "../src/schema/layout.ts";

const WIDTH = 1920;
const HEIGHT = 1080;
const PADDING = 80;
/** Seconds between one edge's flow and the next. */
const EDGE_GAP = 1.6;
/** Seconds the last flow keeps going before the clip ends. */
const TAIL = 2;

const unwrap = <T>(result: Validated<T>, file: string): T => {
  if (!result.ok) throw new Error(`${file}:\n${formatErrors(result.errors).join("\n")}`);
  return result.value;
};

const params = new URLSearchParams(location.search);
const stage = document.querySelector<SVGSVGElement>("#stage");
if (!stage) throw new Error("missing #stage");
const graph = unwrap(parseGraph(graphJson), "graph.json");

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

/** Fits nodes, zones and routes into the frame. Per-scene framing is slice 1.8's job. */
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
  const scale = Math.min(
    (WIDTH - 2 * PADDING) / (maxX - minX),
    (HEIGHT - 2 * PADDING) / (maxY - minY),
  );
  return {
    scale,
    originX: WIDTH / 2 - ((minX + maxX) / 2) * scale,
    originY: HEIGHT / 2 - ((minY + maxY) / 2) * scale,
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
  })),
);

const end = graph.edges.length * EDGE_GAP + EDGE_TIMING.draw + EDGE_TIMING.send + TAIL;
const tl = graph.edges
  .flatMap((edge, i) => {
    const at = 0.5 + i * EDGE_GAP;
    return flowTweens(edge.id, { at, flowFor: end - at - EDGE_TIMING.draw });
  })
  .reduce((builder, tween) => builder.add(tween), timeline())
  .build();

const seek = (t: number): void => apply(tl.seek(t));
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
