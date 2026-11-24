import { describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import { DEFAULT_CONFIG } from "../schema/config.ts";
import { orThrow } from "../schema/errors.ts";
import { type Graph, parseGraph } from "../schema/graph.ts";
import { MAX_BEATS, MIN_BEATS, parseStoryboard, type Storyboard } from "../schema/storyboard.ts";
import {
  addAction,
  addBeat,
  addScene,
  beatHints,
  moveBeat,
  removeAction,
  removeBeat,
  removeScene,
  starterScript,
} from "./script-model.ts";

const graph = orThrow(parseGraph(graphJson), "graph.json");
const example = orThrow(parseStoryboard(storyboardJson, graph), "storyboard.json");
const valid = (storyboard: Storyboard, of: Graph = graph) => parseStoryboard(storyboard, of).ok;
const beatIds = (storyboard: Storyboard, scene = 0) =>
  storyboard.scenes[scene]?.beats.map((b) => b.id);

const tiny = (edges: number): Graph =>
  orThrow(
    parseGraph({
      version: 1,
      title: "Tiny",
      nodes: [
        { id: "a", label: "A", kind: "service" },
        { id: "b", label: "B", kind: "service" },
        { id: "c", label: "C", kind: "database" },
      ],
      edges: [
        { id: "ab", from: "a", to: "b", label: "asks" },
        { id: "bc", from: "b", to: "c" },
      ].slice(0, edges),
      zones: [],
    }),
    "tiny graph",
  );

describe("starterScript", () => {
  it("makes a valid script from the graph: one beat per edge, each with its flow", () => {
    const starter = starterScript(graph);
    expect(valid(starter)).toBe(true);
    const flows = starter.scenes.flatMap((s) =>
      s.beats.flatMap((b) => b.actions.filter((a) => a.type === "flow").map((a) => a.edge)),
    );
    expect(flows).toEqual(graph.edges.slice(0, flows.length).map((e) => e.id));
    expect(starter.scenes.flatMap((s) => s.beats).length).toBeLessThanOrEqual(MAX_BEATS);
  });

  it("names each beat from its edge, with the edge's label when it has one", () => {
    const starter = starterScript(tiny(2));
    expect(starter.scenes[0]?.beats.map((b) => b.caption)).toEqual(
      expect.arrayContaining(["A → B: asks", "B → C"]),
    );
  });

  it("stays valid for a graph with too few edges for the fewest beats a scene needs", () => {
    for (const edges of [0, 1, 2]) {
      const starter = starterScript(tiny(edges));
      expect(valid(starter, tiny(edges)), `${edges} edges`).toBe(true);
      expect(starter.scenes[0]?.beats.length).toBeGreaterThanOrEqual(MIN_BEATS);
    }
  });
});

describe("editing beats", () => {
  it("adds a beat after another with an id of its own, which needs a caption to be valid", () => {
    const added = addBeat(example, 0, 1);
    const ids = beatIds(added) ?? [];
    expect(ids).toHaveLength((beatIds(example)?.length ?? 0) + 1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[2]).not.toBe(beatIds(example)?.[2]);
    expect(valid(added)).toBe(false);
    expect(beatIds(example)).toEqual(storyboardJson.scenes[0]?.beats.map((b) => b.id));
  });

  it("moves a beat up or down within its scene, and not past either end", () => {
    const [first, second] = beatIds(example) ?? [];
    expect(beatIds(moveBeat(example, 0, 0, 1))?.slice(0, 2)).toEqual([second, first]);
    expect(moveBeat(example, 0, 0, -1)).toEqual(example);
  });

  it("removes a beat", () => {
    const removed = removeBeat(example, 0, 0);
    expect(beatIds(removed)).toEqual(beatIds(example)?.slice(1));
  });

  it("adds an action of a kind with the scene's first node or edge, and removes one", () => {
    const withBadge = addAction(example, graph, 0, 0, "badge");
    const actions = withBadge.scenes[0]?.beats[0]?.actions ?? [];
    const badge = actions.at(-1);
    expect(badge).toMatchObject({ type: "badge", node: example.scenes[0]?.nodes[0], tone: "info" });
    expect(valid(withBadge)).toBe(true);
    const withFlow = addAction(example, graph, 0, 0, "flow");
    expect(valid(withFlow)).toBe(true);
    expect(removeAction(withBadge, 0, 0, actions.length - 1)).toEqual(example);
  });
});

describe("editing scenes", () => {
  it("adds a scene with one beat and ids of its own, for the user to give its nodes, and removes it", () => {
    const added = addScene(example);
    expect(added.scenes).toHaveLength(example.scenes.length + 1);
    const scene = added.scenes.at(-1);
    expect(scene).toMatchObject({ title: "", nodes: [] });
    expect(scene?.beats).toHaveLength(1);
    const ids = added.scenes.flatMap((s) => [s.id, ...s.beats.map((b) => b.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(removeScene(added, added.scenes.length - 1)).toEqual(example);
  });
});

describe("beatHints", () => {
  it("gives each beat its length, in the order they play", () => {
    const hints = beatHints(example, graph, DEFAULT_CONFIG);
    const ids = example.scenes.flatMap((s) => s.beats.map((b) => b.id));
    expect([...(hints?.keys() ?? [])]).toEqual(ids);
    for (const hint of hints?.values() ?? []) expect(hint.seconds).toBeGreaterThan(0);
  });

  it("times a line already spoken by its voice, as the checks do, rather than by its words", () => {
    // Estimated from its words, the example's "code" line goes by faster than it can be read.
    const code = example.scenes.flatMap((s) => s.beats).find((b) => b.id === "code");
    if (!code?.say) throw new Error("the example has no spoken code beat");
    const estimated = beatHints(example, graph, DEFAULT_CONFIG)?.get("code");
    expect(estimated?.hints.join(" ")).toMatch(/too fast to read/);
    // Spoken, it takes 6 seconds: long enough to read, and the beat lasts as long.
    const spoken = beatHints(example, graph, DEFAULT_CONFIG, { [code.say]: 6 })?.get("code");
    expect(spoken?.hints).toEqual([]);
    expect(spoken?.seconds).toBeGreaterThan(6);
  });

  /** The example with its first beat changed. */
  const withFirst = (change: Partial<Storyboard["scenes"][number]["beats"][number]>) => {
    const next = structuredClone(example) as Storyboard;
    const scene = next.scenes[0];
    const first = scene?.beats[0];
    if (!scene || !first) throw new Error("no first beat");
    scene.beats[0] = { ...first, ...change };
    return { next, id: first.id };
  };

  it("says in plain words when a line goes by too fast to read", () => {
    // One long word is said in a moment but takes long to read.
    const { next, id } = withFirst({
      say: "Pneumonoultramicroscopicsilicovolcanoconiosis-and-more",
    });
    expect(beatHints(next, graph, DEFAULT_CONFIG)?.get(id)?.hints.join(" ")).toMatch(
      /too fast to read/,
    );
  });

  it("says when the first beat is too long to hook the viewer", () => {
    const long = Array.from({ length: 30 }, () => "word").join(" ");
    const { next, id } = withFirst({ say: long });
    expect(beatHints(next, graph, DEFAULT_CONFIG)?.get(id)?.hints.join(" ")).toMatch(/hook/);
  });

  it("gives none while the script is not valid yet", () => {
    expect(beatHints(addBeat(example, 0, 0), graph, DEFAULT_CONFIG)).toBeUndefined();
  });
});
