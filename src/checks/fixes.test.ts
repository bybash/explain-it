import { describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import type { BeatWarning } from "../schema/checks.ts";
import { orThrow } from "../schema/errors.ts";
import { type Graph, parseGraph } from "../schema/graph.ts";
import { parseStoryboard, type Storyboard } from "../schema/storyboard.ts";
import { applyFix, describeFix, fixesFor, invert } from "./fixes.ts";

const graph = orThrow(parseGraph(graphJson), "graph.json");
const example = orThrow(parseStoryboard(storyboardJson, graph), "storyboard.json");
const first = example.scenes[0]?.beats[0];
if (!first) throw new Error("the example has no beat");
const B1 = first.id;

/** The example, its first beat's step caption replaced. */
const storyboard = (caption: string): Storyboard => ({
  ...example,
  scenes: example.scenes.map((s, i) =>
    i === 0 ? { ...s, beats: s.beats.map((b, j) => (j === 0 ? { ...b, caption } : b)) } : s,
  ),
});

const files = (caption: string) => ({
  graph,
  storyboard: storyboard(caption),
  overrides: { app: { x: 1, y: 0 } },
});

/** A step caption the fixes shorten. */
const LONG = "The user opens the app, then types an email and a password";

describe("fixesFor", () => {
  it("drops the hand-placed positions of the nodes that overlap, and only those", () => {
    const overrides = { app: { x: 1, y: 0 }, user: { x: 5, y: 5 } };
    const warnings: BeatWarning[] = [
      {
        check: "overlap",
        scene: "s1",
        beat: B1,
        at: 0,
        nodes: ["app", "idp"],
        message: "overlap",
      },
    ];
    expect(fixesFor(warnings, overrides)).toEqual([
      {
        kind: "layout",
        before: { app: { x: 1, y: 0 } },
        after: {},
      },
    ]);
  });

  it("offers nothing for an overlap no hand-placed node is in", () => {
    const overrides = {};
    const warnings: BeatWarning[] = [
      { check: "overlap", scene: "s1", beat: B1, at: 0, nodes: ["app"], message: "overlap" },
    ];
    expect(fixesFor(warnings, overrides)).toEqual([]);
  });
});

describe("applyFix", () => {
  const words = {
    kind: "words" as const,
    beat: B1,
    field: "caption" as const,
    before: LONG,
    after: "The user signs in",
  };

  it("changes the words, and its inverse puts them back", () => {
    const fixed = applyFix(files(LONG), words);
    expect(fixed.ok && fixed.value.storyboard?.scenes[0]?.beats[0]?.caption).toBe(
      "The user signs in",
    );
    if (!fixed.ok) throw new Error("not applied");
    const undone = applyFix({ ...files(LONG), ...fixed.value }, invert(words));
    expect(undone.ok && undone.value.storyboard?.scenes[0]?.beats[0]?.caption).toBe(LONG);
  });

  it("refuses when the words have changed since, and says so", () => {
    const fixed = applyFix(files("Something else"), words);
    expect(fixed.ok).toBe(false);
    if (!fixed.ok) expect(fixed.errors[0]?.message).toMatch(/changed since/);
    expect(applyFix(files(LONG), { ...words, beat: "gone" }).ok).toBe(false);
  });

  it("sets the hand-placed positions, and refuses once they moved", () => {
    const layout = { kind: "layout" as const, before: { app: { x: 1, y: 0 } }, after: {} };
    const fixed = applyFix(files(LONG), layout);
    expect(fixed.ok && fixed.value.overrides).toEqual({});
    expect(applyFix({ ...files(LONG), overrides: { app: { x: 2, y: 0 } } }, layout).ok).toBe(false);
  });

  it("undoes a layout fix after another node was put by hand, and keeps that one", () => {
    const layout = { kind: "layout" as const, before: { app: { x: 1, y: 0 } }, after: {} };
    const moved = { user: { x: 4, y: 4 } };
    const undone = applyFix({ ...files(LONG), overrides: moved }, invert(layout));
    expect(undone.ok && undone.value.overrides).toEqual({
      user: { x: 4, y: 4 },
      app: { x: 1, y: 0 },
    });
  });
});

describe("describeFix", () => {
  it("says what a fix does in a few plain words", () => {
    expect(describeFix({ kind: "words", beat: B1, field: "say", before: "a", after: "b" })).toBe(
      `Shorten the line of beat "${B1}"`,
    );
    expect(describeFix({ kind: "layout", before: { a: { x: 0, y: 0 } }, after: {} })).toBe(
      'Lay out node "a" again, in place of where it was put by hand',
    );
  });
});

describe("a rewrite", () => {
  const relabelled = (label: string): Graph => ({
    ...graph,
    nodes: graph.nodes.map((n, i) => (i === 0 ? { ...n, label } : n)),
  });
  const rewrite = {
    kind: "rewrite" as const,
    before: { graph: relabelled("The person signing in") },
    after: { graph: relabelled("User") },
  };

  it("puts the files it rewrites in place, and its inverse puts them back", () => {
    const now = { ...files(LONG), graph: relabelled("The person signing in") };
    const fixed = applyFix(now, rewrite);
    expect(fixed.ok && fixed.value.graph?.nodes[0]?.label).toBe("User");
    const undone = applyFix({ ...now, graph: relabelled("User") }, invert(rewrite));
    expect(undone.ok && undone.value.graph?.nodes[0]?.label).toBe("The person signing in");
  });

  it("refuses once a file it rewrites has changed since", () => {
    expect(applyFix({ ...files(LONG), graph: relabelled("Someone") }, rewrite).ok).toBe(false);
  });

  it("says what it does as the repair proposed it", () => {
    expect(describeFix(rewrite)).toBe("Rewrite graph.json");
  });
});
