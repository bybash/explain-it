import { readingWarnings } from "../checks/timing.ts";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import type { Config } from "../schema/config.ts";
import type { Graph } from "../schema/graph.ts";
import { HOOK_SECONDS } from "../schema/story.ts";
import {
  type ACTION_TYPES,
  type Action,
  type Beat,
  MAX_BEATS,
  MAX_CAPTION,
  MAX_SCENE_NODES,
  MIN_BEATS,
  parseStoryboard,
  type Scene,
  type Storyboard,
} from "../schema/storyboard.ts";

/**
 * The Script gate's editor, as pure functions over the storyboard: a starter
 * script made from the graph, the edits the form makes, and the hints shown
 * beside each beat. Each edit returns a new storyboard; the one given is
 * left as it was. A storyboard being edited may not be valid yet.
 */

export type ActionType = (typeof ACTION_TYPES)[number];

/** A caption cut to fit, with an ellipsis when it was cut. */
const fitCaption = (text: string) =>
  text.length <= MAX_CAPTION ? text : `${text.slice(0, MAX_CAPTION - 1).trimEnd()}…`;

/** An id of the form `prefix_n` that no scene or beat has yet. */
const freshId = (storyboard: Storyboard, prefix: string): string => {
  const taken = new Set(
    storyboard.scenes.flatMap((scene) => [scene.id, ...scene.beats.map((b) => b.id)]),
  );
  let n = 1;
  while (taken.has(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
};

/**
 * A first script from the graph, to rewrite rather than write from nothing:
 * one scene with the graph's nodes (as many as a scene takes, those the
 * edges join first), a beat for each edge between them that shows its ends
 * and sends its flow, and beats that show the nodes left, until the scene
 * has the fewest beats it needs. Captions come from the labels; no beat has
 * narration yet.
 */
export const starterScript = (graph: Graph): Storyboard => {
  const label = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const byEdges = [...new Set(graph.edges.flatMap((e) => [e.from, e.to]))];
  const nodes = [...new Set([...byEdges, ...graph.nodes.map((n) => n.id)])].slice(
    0,
    MAX_SCENE_NODES,
  );
  const inScene = new Set(nodes);
  const shown = new Set<string>();
  const appear = (ids: readonly string[]): Action[] =>
    ids.flatMap((node) => {
      if (shown.has(node)) return [];
      shown.add(node);
      return [{ type: "appear", node }];
    });

  const beats: Beat[] = graph.edges
    .filter((e) => inScene.has(e.from) && inScene.has(e.to))
    .slice(0, MAX_BEATS)
    .map((edge, i) => {
      const from = label.get(edge.from);
      const to = label.get(edge.to);
      return {
        id: `beat_${i + 1}`,
        caption: fitCaption(edge.label ? `${from} → ${to}: ${edge.label}` : `${from} → ${to}`),
        actions: [...appear([edge.from, edge.to]), { type: "flow", edge: edge.id }],
      };
    });
  for (const node of nodes) {
    if (beats.length >= MIN_BEATS || beats.length >= MAX_BEATS) break;
    if (shown.has(node)) continue;
    beats.push({
      id: `beat_${beats.length + 1}`,
      caption: fitCaption(label.get(node) ?? node),
      actions: appear([node]),
    });
  }
  // A graph with few nodes and edges still needs the fewest beats a scene takes: it ends on the last node.
  const last = nodes.at(-1);
  while (beats.length < MIN_BEATS && last !== undefined)
    beats.push({
      id: `beat_${beats.length + 1}`,
      caption: fitCaption(`Where it ends: ${label.get(last)}`),
      actions: [{ type: "highlight", node: last }],
    });

  return {
    version: 1,
    scenes: [{ id: "main", title: fitCaption(graph.title), nodes, beats }],
  };
};

/** The storyboard with one scene changed by `change`. */
const inScene = (storyboard: Storyboard, at: number, change: (scene: Scene) => Scene) => ({
  ...storyboard,
  scenes: storyboard.scenes.map((scene, i) => (i === at ? change(scene) : scene)),
});

/** The storyboard with one beat changed by `change`. */
export const editBeat = (
  storyboard: Storyboard,
  scene: number,
  beat: number,
  change: (beat: Beat) => Beat,
): Storyboard =>
  inScene(storyboard, scene, (s) => ({
    ...s,
    beats: s.beats.map((b, i) => (i === beat ? change(b) : b)),
  }));

/** A new beat after the one at `after` (-1 for the first), its caption left to write. */
export const addBeat = (storyboard: Storyboard, scene: number, after: number): Storyboard => {
  const beat: Beat = { id: freshId(storyboard, "beat"), caption: "", actions: [] };
  return inScene(storyboard, scene, (s) => ({
    ...s,
    beats: [...s.beats.slice(0, after + 1), beat, ...s.beats.slice(after + 1)],
  }));
};

export const removeBeat = (storyboard: Storyboard, scene: number, beat: number): Storyboard =>
  inScene(storyboard, scene, (s) => ({ ...s, beats: s.beats.filter((_, i) => i !== beat) }));

/** A beat moved `by` places within its scene; past either end, nothing moves. */
export const moveBeat = (
  storyboard: Storyboard,
  scene: number,
  beat: number,
  by: -1 | 1,
): Storyboard => {
  const beats = storyboard.scenes[scene]?.beats ?? [];
  const to = beat + by;
  const moving = beats[beat];
  if (!moving || to < 0 || to >= beats.length) return storyboard;
  const rest = beats.filter((_, i) => i !== beat);
  return inScene(storyboard, scene, (s) => ({
    ...s,
    beats: [...rest.slice(0, to), moving, ...rest.slice(to)],
  }));
};

/** A new scene at the end, with one beat to write; the user picks its nodes. */
export const addScene = (storyboard: Storyboard): Storyboard => {
  const id = freshId(storyboard, "scene");
  const beat: Beat = {
    id: freshId(
      { ...storyboard, scenes: [...storyboard.scenes, { id, title: "", nodes: [], beats: [] }] },
      "beat",
    ),
    caption: "",
    actions: [],
  };
  return {
    ...storyboard,
    scenes: [...storyboard.scenes, { id, title: "", nodes: [], beats: [beat] }],
  };
};

export const removeScene = (storyboard: Storyboard, scene: number): Storyboard => ({
  ...storyboard,
  scenes: storyboard.scenes.filter((_, i) => i !== scene),
});

/** The storyboard with one scene's title or nodes changed. */
export const editScene = (
  storyboard: Storyboard,
  scene: number,
  change: Partial<Pick<Scene, "title" | "nodes">>,
): Storyboard => inScene(storyboard, scene, (s) => ({ ...s, ...change }));

/** The first edge whose ends are both in the scene: what a new flow sends. */
export const sceneEdges = (scene: Scene, graph: Graph) => {
  const nodes = new Set(scene.nodes);
  return graph.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));
};

/**
 * A new action of a kind, on the scene's first node or edge, for the user
 * to change; undefined for a flow when no edge joins two of its nodes.
 */
export const newAction = (type: ActionType, scene: Scene, graph: Graph): Action | undefined => {
  const node = scene.nodes[0];
  if (node === undefined) return undefined;
  switch (type) {
    case "appear":
    case "highlight":
      return { type, node };
    case "flow": {
      const edge = sceneEdges(scene, graph)[0];
      return edge ? { type, edge: edge.id } : undefined;
    }
    case "callout":
      return { type, node, text: "What to remember" };
    case "dim":
      return { type, except: [node] };
    case "badge":
      return { type, node, text: "done", tone: "info" };
  }
};

export const addAction = (
  storyboard: Storyboard,
  graph: Graph,
  scene: number,
  beat: number,
  type: ActionType,
): Storyboard => {
  const of = storyboard.scenes[scene];
  const action = of && newAction(type, of, graph);
  return action
    ? editBeat(storyboard, scene, beat, (b) => ({ ...b, actions: [...b.actions, action] }))
    : storyboard;
};

export const removeAction = (
  storyboard: Storyboard,
  scene: number,
  beat: number,
  action: number,
): Storyboard =>
  editBeat(storyboard, scene, beat, (b) => ({
    ...b,
    actions: b.actions.filter((_, i) => i !== action),
  }));

/** What the editor says beside a beat: how long it lasts, and what to change. */
export type BeatHint = { readonly seconds: number; readonly hints: readonly string[] };

const HINTS = {
  step: "The caption goes by too fast to read: shorten it.",
  narration: "The line goes by too fast to read: use shorter words, or split it.",
} as const;

/**
 * Each beat's length and hints, as the quick checks would find them, in the
 * order the beats play: a line already spoken (`measured`, its seconds by
 * its words) is timed by its voice, any other by its words. Undefined while
 * the storyboard is not valid against the graph.
 */
export const beatHints = (
  storyboard: Storyboard,
  graph: Graph,
  config: Config,
  measured: Readonly<Record<string, number>> = {},
): Map<string, BeatHint> | undefined => {
  const parsed = parseStoryboard(storyboard, graph);
  if (!parsed.ok) return undefined;
  // A line already spoken is timed by its voice, as the checks time it; the rest by their words.
  const narration = Object.fromEntries(
    parsed.value.scenes.flatMap((scene) =>
      scene.beats.flatMap((beat) => {
        const seconds = beat.say === undefined ? undefined : measured[beat.say];
        return seconds === undefined ? [] : [[beat.id, seconds]];
      }),
    ),
  );
  const plan = buildBeats(parsed.value, graph, beatOptions(config, narration));
  const said = new Map<string, string[]>();
  for (const warning of readingWarnings(plan)) {
    const hint = warning.message.startsWith("the step caption") ? HINTS.step : HINTS.narration;
    said.set(warning.beat, [...new Set([...(said.get(warning.beat) ?? []), hint])]);
  }
  const tenth = (seconds: number) => Math.round(seconds * 10) / 10;
  return new Map(
    plan.beats.map((beat, i) => {
      const seconds = beat.end - beat.start;
      const hook =
        i === 0 && seconds > HOOK_SECONDS
          ? [
              `As the first beat, this is the hook: it takes ${tenth(seconds)} s, and a hook lands within ${HOOK_SECONDS} s. Shorten its line.`,
            ]
          : [];
      return [beat.id, { seconds: tenth(seconds), hints: [...hook, ...(said.get(beat.id) ?? [])] }];
    }),
  );
};
