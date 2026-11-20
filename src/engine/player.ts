import type { Config } from "../schema/config.ts";
import { orThrow } from "../schema/errors.ts";
import type { Graph } from "../schema/graph.ts";
import type { Layout } from "../schema/layout.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { type BeatPlan, buildBeats, type ScenePlan, sceneTarget, scoped } from "./beats/build.ts";
import { edgeRoutes } from "./edges/fallback.ts";
import { edgeGeometry } from "./edges/geometry.ts";
import { renderEdges } from "./edges/svg.ts";
import { fitView } from "./iso/frame.ts";
import { project, type View } from "./iso/project.ts";
import { buildScene, type Scene } from "./iso/scene.ts";
import { renderScene } from "./iso/svg.ts";
import { nodeTarget, zoneTarget } from "./iso/tweens.ts";
import { type OverlayDrawing, renderOverlays } from "./overlays/html.ts";
import { STAGE, type StageRegions, stageRegions } from "./overlays/regions.ts";
import { applyTheme, loadFont } from "./theme/apply.ts";
import { fontFor } from "./theme/fonts.ts";
import { DEFAULT_CATEGORY } from "./theme/kinds.ts";
import type { ThemeMode } from "./theme/palettes.ts";
import { themeFor } from "./theme/theme.ts";
import { type State, timeline } from "./timeline.ts";

/** A project's files, already validated, and the theme mode to draw it in. */
export type PlayerInput = {
  readonly graph: Graph;
  readonly storyboard: Storyboard;
  readonly layout: Layout;
  readonly config: Config;
  readonly mode: ThemeMode;
  /** Where the bundled fonts are served: the URL of `assets/fonts/`. */
  readonly fonts: URL;
};

/** What a page exposes as `__seek`, `__duration` and `__cues` (SPEC, Engine). */
export type Player = {
  readonly seek: (t: number) => void;
  readonly duration: number;
  readonly cues: readonly { readonly start: number; readonly end: number; readonly text: string }[];
  readonly plan: BeatPlan;
};

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Draws a project into `frame` and returns the player that seeks it. The
 * theme and font go on the document, and the font is loaded before anything
 * is measured. Each scene gets its own layer, framed to its own nodes; the
 * beat builder's plan poses every layer from the timeline. This is the
 * browser edge that the dev page and the render page share.
 */
export const mountPlayer = async (frame: HTMLElement, input: PlayerInput): Promise<Player> => {
  const { graph, storyboard, layout, config, mode } = input;
  const theme = orThrow(themeFor(config.theme.palette, mode), "theme");
  const font = orThrow(fontFor(config.font), "font");
  applyTheme(document.documentElement, theme, font);
  await loadFont(font, input.fonts);

  const regions = stageRegions(config.captions);
  const routes = edgeRoutes(graph, layout);
  const plan = buildBeats(storyboard, graph);
  frame.replaceChildren();
  const posers = plan.scenes.map((scene) =>
    drawScene(frame, { graph, layout, routes, plan, regions }, scene),
  );
  const tl = plan.tweens.reduce((builder, tween) => builder.add(tween), timeline()).build();
  return {
    seek: (t) => {
      const state = tl.seek(t);
      for (const pose of posers) pose(state);
    },
    duration: plan.duration,
    cues: plan.cues.map(({ start, end, text }) => ({ start, end, text })),
    plan,
  };
};

type Drawing = {
  readonly graph: Graph;
  readonly layout: Layout;
  readonly routes: ReturnType<typeof edgeRoutes>;
  readonly plan: BeatPlan;
  readonly regions: StageRegions;
};

/** The graph cut down to one scene: its nodes, and the edges it flows. */
const sceneGraph = (graph: Graph, scene: ScenePlan): Graph => {
  const nodes = new Set(scene.nodes);
  const edges = new Set(scene.edges);
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => nodes.has(n.id)),
    edges: graph.edges.filter((e) => edges.has(e.id)),
  };
};

/** Frames a scene's nodes, zones and routes into the content region. */
const framed = (
  { layout, routes, regions }: Drawing,
  scene: ScenePlan,
  cut: Graph,
): { view: View; shape: Scene } => {
  const positions = Object.fromEntries(
    scene.nodes.flatMap((id) => {
      const at = layout.positions[id];
      return at ? [[id, at]] : [];
    }),
  );
  const shapeAt = (view: View) => orThrow(buildScene(cut, positions, view), `scene ${scene.id}`);
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
const drawScene = (
  frame: HTMLElement,
  drawing: Drawing,
  scene: ScenePlan,
): ((state: State) => void) => {
  const layer = document.createElement("div");
  layer.className = "scene-layer";
  layer.dataset.scene = scene.id;
  const stage = document.createElementNS(SVG_NS, "svg");
  stage.setAttribute("class", "stage");
  stage.setAttribute("viewBox", `0 0 ${STAGE.width} ${STAGE.height}`);
  const overlayRoot = document.createElement("div");
  overlayRoot.className = "overlays";
  layer.append(stage, overlayRoot);
  frame.appendChild(layer);

  const cut = sceneGraph(drawing.graph, scene);
  const { view, shape } = framed(drawing, scene, cut);
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
        geometry: edgeGeometry(drawing.routes[edge.id] ?? [], view, occluders),
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
  const overlays = drawing.plan.overlays
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
  const applyOverlays = renderOverlays(overlayRoot, overlays, drawing.regions, [
    ...occluders,
    ...pills,
  ]);

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

/** Puts the player on the page as `__seek`, `__duration` and `__cues`, for capture. */
export const expose = (player: Player): void => {
  Object.assign(window, {
    __seek: player.seek,
    __duration: player.duration,
    __cues: player.cues,
  });
};
