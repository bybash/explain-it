// Dev page for slice 1.3: the oauth-login example with hand-placed positions.
// Automatic layout arrives in slice 1.4.
import graphJson from "../examples/oauth-login/graph.json" with { type: "json" };
import { buildScene } from "../src/engine/iso/scene.ts";
import { renderScene } from "../src/engine/iso/svg.ts";
import { formatErrors } from "../src/schema/errors.ts";
import { parseGraph } from "../src/schema/graph.ts";

const positions = {
  idp: { x: 5, y: -2.5 },
  browser: { x: 0, y: 3.5 },
  user: { x: 0, y: 8.5 },
  app: { x: 5, y: 3.5 },
  sessions: { x: 10.5, y: 1 },
  api: { x: 10.5, y: 6 },
};

const stage = document.querySelector<SVGSVGElement>("#stage");
const graph = parseGraph(graphJson);
if (!stage) throw new Error("missing #stage");
if (!graph.ok) throw new Error(formatErrors(graph.errors).join("\n"));

const scene = buildScene(graph.value, positions, { scale: 46, originX: 860, originY: 230 });
if (!scene.ok) throw new Error(formatErrors(scene.errors).join("\n"));
renderScene(stage, scene.value);
document.body.dataset.ready = "true";
