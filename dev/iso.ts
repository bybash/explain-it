// Dev page: the oauth-login example drawn from its computed layout.json.
// Routes are drawn as faint debug lines; real edges arrive in slice 1.5.
import graphJson from "../examples/oauth-login/graph.json" with { type: "json" };
import layoutJson from "../examples/oauth-login/layout.json" with { type: "json" };
import { project, type View } from "../src/engine/iso/project.ts";
import { buildScene, type Scene } from "../src/engine/iso/scene.ts";
import { renderScene } from "../src/engine/iso/svg.ts";
import { formatErrors } from "../src/schema/errors.ts";
import { parseGraph } from "../src/schema/graph.ts";
import { type Layout, parseLayout } from "../src/schema/layout.ts";

const WIDTH = 1920;
const HEIGHT = 1080;
const PADDING = 80;

const stage = document.querySelector<SVGSVGElement>("#stage");
if (!stage) throw new Error("missing #stage");
const graph = parseGraph(graphJson);
if (!graph.ok) throw new Error(formatErrors(graph.errors).join("\n"));
const layout = parseLayout(layoutJson, graph.value);
if (!layout.ok) throw new Error(formatErrors(layout.errors).join("\n"));

const sceneAt = (view: View): Scene => {
  if (!graph.ok || !layout.ok) throw new Error("unreachable");
  const scene = buildScene(graph.value, layout.value.positions, view);
  if (!scene.ok) throw new Error(formatErrors(scene.errors).join("\n"));
  return scene.value;
};

/** Fits nodes, zones and routes into the frame. Per-scene framing is slice 1.8's job. */
const frameAll = (): View => {
  const unit = sceneAt({ scale: 1, originX: 0, originY: 0 });
  const points = [
    ...unit.nodes.flatMap((n) => [...n.faces.top, ...n.faces.left, ...n.faces.right]),
    ...unit.zones.flatMap((z) => z.polygon),
    ...Object.values(layout.ok ? layout.value.routes : {}).flatMap((route) =>
      (route ?? []).map((p) =>
        project({ x: p.x, y: p.y, z: 0 }, { scale: 1, originX: 0, originY: 0 }),
      ),
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

const drawRoutes = (routes: Layout["routes"], view: View): void => {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "debug-routes");
  for (const route of Object.values(routes)) {
    if (!route) continue;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    const points = route.map((p) => project({ x: p.x, y: p.y, z: 0 }, view));
    path.setAttribute("points", points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
    group.appendChild(path);
  }
  stage.querySelector(".zones")?.after(group);
};

const view = frameAll();
renderScene(stage, sceneAt(view));
drawRoutes(layout.value.routes, view);
document.body.dataset.ready = "true";
