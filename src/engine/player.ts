import { convexHull } from "../checks/geometry.ts";
import type { Shape } from "../schema/checks.ts";
import { STAGE } from "../schema/checks.ts";
import { DEFAULT_CATEGORY } from "../schema/colours.ts";
import { ANGLE_ELEVATIONS, type Camera, type Config, type LogoImages } from "../schema/config.ts";
import { orThrow } from "../schema/errors.ts";
import type { Graph } from "../schema/graph.ts";
import type { Layout } from "../schema/layout.ts";
import type { Narration } from "../schema/narration.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import {
  type BeatPlan,
  beatOptions,
  buildBeats,
  type CardPlan,
  type ScenePlan,
  sceneTarget,
  scoped,
} from "./beats/build.ts";
import {
  type LogoDrawing,
  type Poser,
  renderEndCard,
  renderLogoCard,
  renderLogoLayer,
  renderTitleCard,
} from "./cards/html.ts";
import { logoShowsOn } from "./cards/show.ts";
import { edgeRoutes } from "./edges/fallback.ts";
import { edgeGeometry } from "./edges/geometry.ts";
import { renderEdges } from "./edges/svg.ts";
import { fitView, withCamera } from "./iso/frame.ts";
import { project, type View } from "./iso/project.ts";
import { buildScene, type Scene } from "./iso/scene.ts";
import { renderScene } from "./iso/svg.ts";
import { nodeTarget, zoneTarget } from "./iso/tweens.ts";
import { type OverlayDrawing, renderOverlays } from "./overlays/html.ts";
import { type StageRegions, stageRegions } from "./overlays/regions.ts";
import { drawnShapes } from "./shapes.ts";
import { applyTheme, loadFont } from "./theme/apply.ts";
import { fontFor } from "./theme/fonts.ts";
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
  /** The logo's images, when the config has a logo. */
  readonly logo?: LogoImages;
  /** Measured narration by beat; lines without it are estimated. */
  readonly narration?: Narration;
};

/** What a page exposes as `__seek`, `__duration` and `__cues` (SPEC, Engine). */
export type Player = {
  readonly seek: (t: number) => void;
  readonly duration: number;
  readonly cues: readonly { readonly start: number; readonly end: number; readonly text: string }[];
  readonly plan: BeatPlan;
  /** What is drawn now, for the checks (see `shapes.ts`). */
  readonly shapes: () => Shape[];
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

  const logo: LogoDrawing | undefined =
    config.logo && input.logo
      ? { src: input.logo[mode], corner: config.logo.corner, show: config.logo.show }
      : undefined;
  const onEveryFrame = logo && logoShowsOn(logo.show, "frames") ? logo : undefined;
  const regions = withStepLines(
    stageRegions(config.captions, onEveryFrame?.corner),
    storyboard,
    font.family,
    (lines) => stageRegions(config.captions, onEveryFrame?.corner, lines),
  );
  const routes = edgeRoutes(graph, layout);
  const plan = buildBeats(storyboard, graph, beatOptions(config, input.narration));
  frame.replaceChildren();
  const posers = plan.scenes.map((scene) =>
    drawScene(
      frame,
      {
        graph,
        layout,
        routes,
        plan,
        regions,
        cameras: config.camera ?? {},
        elevation: ANGLE_ELEVATIONS[config.angle],
      },
      scene,
    ),
  );
  for (const card of plan.cards) posers.push(drawCard(frame, card.id, config, logo));
  if (onEveryFrame) posers.push(renderLogoLayer(frame, onEveryFrame));
  await Promise.all([...frame.querySelectorAll("img")].map((img) => img.decode()));
  const tl = plan.tweens.reduce((builder, tween) => builder.add(tween), timeline()).build();
  return {
    seek: (t) => {
      const state = tl.seek(t);
      for (const pose of posers) pose(state);
    },
    duration: plan.duration,
    cues: plan.cues.map(({ start, end, text }) => ({ start, end, text })),
    plan,
    shapes: () => drawnShapes(frame, graph),
  };
};

/** Draws one of the plan's cards; the plan only has a card the config can fill. */
const drawCard = (
  frame: HTMLElement,
  id: CardPlan["id"],
  config: Config,
  logo: LogoDrawing | undefined,
): Poser => {
  const missing = () => new Error(`the plan has a ${id} card the config cannot fill`);
  const { title, end } = config.cards ?? {};
  switch (id) {
    case "title":
    case "title-again":
      if (!title) throw missing();
      return renderTitleCard(frame, id, title, logo);
    case "end":
      if (!end) throw missing();
      return renderEndCard(frame, end, logo);
    case "logo":
      if (!logo) throw missing();
      return renderLogoCard(frame, logo.src);
  }
};

/**
 * The regions with a two-line step band at the top when a step caption does
 * not fit on one line in the video's font (decision 049); the font is loaded
 * first, so the measure is the one the page draws with.
 */
const withStepLines = (
  regions: StageRegions,
  storyboard: Storyboard,
  family: string,
  twoLines: (lines: 2) => StageRegions,
): StageRegions => {
  if (regions.place !== "top" || !regions.step) return regions;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return regions;
  context.font = `700 ${regions.fonts.step}px "${family}"`;
  const width = regions.step.width;
  const tooLong = storyboard.scenes.some((scene) =>
    scene.beats.some((beat) => context.measureText(beat.caption).width > width),
  );
  return tooLong ? twoLines(2) : regions;
};

type Drawing = {
  readonly graph: Graph;
  readonly layout: Layout;
  readonly routes: ReturnType<typeof edgeRoutes>;
  readonly plan: BeatPlan;
  readonly regions: StageRegions;
  /** Each scene's camera, by scene id (decision 044). */
  readonly cameras: Readonly<Record<string, Camera>>;
  /** The degrees the scenes are seen from, for an angle other than isometric (decision 047). */
  readonly elevation: number | undefined;
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
  { layout, routes, regions, cameras, elevation }: Drawing,
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
  const unitView: View = { scale: 1, originX: 0, originY: 0, elevation };
  const unit = shapeAt(unitView);
  const fitted = fitView(
    [
      ...unit.nodes.flatMap((n) => [...n.faces.top, ...n.faces.left, ...n.faces.right]),
      ...unit.zones.flatMap((z) => z.polygon),
      ...scene.edges.flatMap((id) =>
        (routes[id] ?? []).map((p) => project({ x: p.x, y: p.y, z: 0 }, unitView)),
      ),
    ],
    regions.content,
  );
  const view = withCamera({ ...fitted, elevation }, regions.content, cameras[scene.id]);
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
  /** Each box's outline on screen: labels keep clear of them, and an edge stops at its target's. */
  const outlines = new Map(
    shape.nodes.map((n) => [n.id, convexHull([...n.faces.top, ...n.faces.left, ...n.faces.right])]),
  );
  const boxes = [...outlines.values()];
  const lines = stage.querySelector<SVGGElement>(".edges");
  const labels = stage.querySelector<SVGGElement>(".edge-labels");
  if (!lines || !labels) throw new Error("missing edge layers");
  const applyEdges = renderEdges(
    { lines, labels },
    cut.edges.map((edge) => {
      const label = scene.edgeLabels[edge.id] ?? edge.label;
      return {
        id: scoped(scene.id, edge.id),
        geometry: edgeGeometry(
          drawing.routes[edge.id] ?? [],
          view,
          occluders,
          outlines.get(edge.to),
        ),
        ...(label === undefined ? {} : { label }),
        category: edge.category ?? DEFAULT_CATEGORY,
      };
    }),
    boxes,
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
            nodeId: o.node,
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
            nodeId: o.node,
            node: shapeOf(o.node).faces,
            text: o.text,
            tone: o.tone,
          };
        case "list":
          return { kind: "list", id: o.id, shown, text: o.text, scene: o.scene, index: o.index };
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

/**
 * Puts the player on the page as `__seek`, `__duration` and `__cues`, for
 * capture, and `__captions(show)`, which hides the narration captions for
 * the clean video (SPEC, Rendering). For the checks: `__beats`, each beat's
 * scene and span, and `__shapes()`, what is drawn at the moment.
 */
export const expose = (player: Player): void => {
  Object.assign(window, {
    __seek: player.seek,
    __duration: player.duration,
    __cues: player.cues,
    __beats: player.plan.beats.map(({ id, scene, start, end }) => ({ id, scene, start, end })),
    __shapes: player.shapes,
    __captions: (show: boolean) => document.body.classList.toggle("without-narration", !show),
  });
};
