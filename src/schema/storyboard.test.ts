import { describe, expect, it } from "vitest";
import { formatErrors } from "./errors.ts";
import { type Graph, parseGraph } from "./graph.ts";
import { parseStoryboard } from "./storyboard.ts";

const graph = ((): Graph => {
  const result = parseGraph({
    version: 1,
    title: "Login",
    nodes: [
      { id: "browser", label: "Browser", kind: "actor" },
      { id: "app", label: "App", kind: "service" },
      { id: "db", label: "Users", kind: "database" },
    ],
    edges: [
      { id: "e1", from: "browser", to: "app" },
      { id: "e2", from: "app", to: "db" },
    ],
    zones: [],
  });
  if (!result.ok) throw new Error("fixture graph is invalid");
  return result.value;
})();

const beat = (id: string, actions: unknown[] = []) => ({ id, caption: `Step ${id}`, actions });

const validStoryboard = () => ({
  version: 1,
  scenes: [
    {
      id: "request",
      title: "Request",
      nodes: ["browser", "app"],
      beats: [
        beat("b1", [{ type: "appear", node: "browser" }]),
        beat("b2", [{ type: "flow", edge: "e1", label: "credentials" }]),
        beat("b3", [{ type: "callout", node: "app", text: "Checks the password" }]),
      ],
    },
    {
      id: "lookup",
      title: "Lookup",
      nodes: ["app", "db"],
      beats: [
        beat("b4", [{ type: "flow", edge: "e2" }]),
        beat("b5", [{ type: "badge", node: "db", text: "found", tone: "ok" }]),
        beat("b6", [{ type: "dim", except: ["db"] }]),
        { id: "b7", caption: "Done.", say: "And the user is in.", actions: [] },
      ],
    },
  ],
});

const errorsFor = (data: unknown) => {
  const result = parseStoryboard(data, graph);
  if (result.ok) throw new Error("expected errors");
  return formatErrors(result.errors);
};

describe("parseStoryboard", () => {
  it("accepts a valid storyboard", () => {
    expect(parseStoryboard(validStoryboard(), graph).ok).toBe(true);
  });

  it("names the exact beat when a caption is too long", () => {
    const storyboard = validStoryboard();
    const scene = storyboard.scenes[1];
    if (!scene) throw new Error("fixture");
    scene.beats[3] = { id: "b7", caption: "x".repeat(74), say: "And the user is in.", actions: [] };
    expect(errorsFor(storyboard)).toEqual(["scenes[1].beats[3].caption: 74 characters, max 60"]);
  });

  it("requires 1 to 3 scenes and 3 to 10 beats", () => {
    const storyboard = validStoryboard();
    const scene = storyboard.scenes[0];
    if (!scene) throw new Error("fixture");
    scene.beats = scene.beats.slice(0, 2);
    expect(errorsFor(storyboard)).toEqual(["scenes[0].beats: 2 items, min 3"]);
    expect(errorsFor({ version: 1, scenes: [] })).toEqual(["scenes: 0 items, min 1"]);
  });

  it("lists the action types", () => {
    const storyboard = validStoryboard();
    const scene = storyboard.scenes[0];
    if (!scene) throw new Error("fixture");
    scene.beats[0] = beat("b1", [{ type: "zoom", node: "browser" }]);
    expect(errorsFor(storyboard)).toEqual([
      'scenes[0].beats[0].actions[0].type: must be one of "appear", "flow", "highlight", "callout", "dim", "badge"',
    ]);
  });

  it("rejects scene nodes missing from the graph", () => {
    const storyboard = validStoryboard();
    const scene = storyboard.scenes[0];
    if (!scene) throw new Error("fixture");
    scene.nodes = ["browser", "cache"];
    expect(errorsFor(storyboard)).toEqual(['scenes[0].nodes[1]: unknown node "cache"']);
  });

  it("rejects actions on nodes outside their scene", () => {
    const storyboard = validStoryboard();
    const scene = storyboard.scenes[0];
    if (!scene) throw new Error("fixture");
    scene.beats[0] = beat("b1", [{ type: "highlight", node: "db" }]);
    expect(errorsFor(storyboard)).toEqual([
      'scenes[0].beats[0].actions[0].node: "db" is not in scene "request"',
    ]);
  });

  it("rejects flows on unknown edges or edges leaving the scene", () => {
    const storyboard = validStoryboard();
    const scene = storyboard.scenes[0];
    if (!scene) throw new Error("fixture");
    scene.beats[0] = beat("b1", [
      { type: "flow", edge: "e9" },
      { type: "flow", edge: "e2" },
    ]);
    expect(errorsFor(storyboard)).toEqual([
      'scenes[0].beats[0].actions[0].edge: unknown edge "e9"',
      'scenes[0].beats[0].actions[1].edge: "e2" connects "db", which is not in scene "request"',
    ]);
  });

  it("checks every node a dim keeps", () => {
    const storyboard = validStoryboard();
    const scene = storyboard.scenes[1];
    if (!scene) throw new Error("fixture");
    scene.beats[2] = beat("b6", [{ type: "dim", except: ["db", "browser"] }]);
    expect(errorsFor(storyboard)).toEqual([
      'scenes[1].beats[2].actions[0].except[1]: "browser" is not in scene "lookup"',
    ]);
  });

  it("rejects duplicate scene and beat ids across the storyboard", () => {
    const storyboard = validStoryboard();
    const scene = storyboard.scenes[1];
    if (!scene) throw new Error("fixture");
    scene.beats[0] = beat("b1", [{ type: "flow", edge: "e2" }]);
    expect(errorsFor(storyboard)).toEqual(['scenes[1].beats[0].id: duplicate id "b1"']);
  });
});
