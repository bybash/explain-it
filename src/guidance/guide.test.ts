import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../engine/theme/kinds.ts";
import { PALETTES } from "../engine/theme/palettes.ts";
import { ConfigSchema } from "../schema/config.ts";
import { orThrow } from "../schema/errors.ts";
import { GraphSchema, MERMAID_KEYWORDS, NODE_KINDS, parseGraph } from "../schema/graph.ts";
import { TOOL_NAMES } from "../schema/mcp.ts";
import { STORY_SHAPES } from "../schema/story.ts";
import { ACTION_TYPES, parseStoryboard, StoryboardSchema } from "../schema/storyboard.ts";
import { EXAMPLE_GRAPH, EXAMPLE_SHAPE, EXAMPLE_STORYBOARD } from "./example.ts";
import {
  authoringGuide,
  GRAPH_SHAPE_NAMES,
  graphSummary,
  STORYBOARD_SHAPE_NAMES,
  storyboardSummary,
} from "./guide.ts";
import { schemaShape } from "./shape.ts";

const guide = authoringGuide();

describe("authoringGuide", () => {
  it("gives the formats of graph.json, storyboard.json and config.json as the schemas define them", () => {
    expect(guide).toContain(schemaShape("Graph", GraphSchema, GRAPH_SHAPE_NAMES));
    expect(guide).toContain(schemaShape("Storyboard", StoryboardSchema, STORYBOARD_SHAPE_NAMES));
    expect(guide).toContain(schemaShape("Config", ConfigSchema));
  });

  it("states the rules the shapes cannot show", () => {
    expect(guide).toMatch(/unique across nodes, edges and zones/);
    expect(guide).toMatch(/Scene and beat ids are unique across the whole storyboard/);
    expect(guide).toMatch(/any other field.*is an error/);
    expect(guide).toMatch(/Lucide/);
    for (const word of [...MERMAID_KEYWORDS, ...CATEGORIES, ...Object.keys(PALETTES)])
      expect(guide, word).toContain(`"${word}"`);
  });

  it("names the tools by the names they are registered under", () => {
    for (const name of Object.values(TOOL_NAMES))
      expect(guide + graphSummary(), name).toContain(name);
  });

  it("carries a worked example that validates and uses every action", () => {
    const graph = orThrow(parseGraph(EXAMPLE_GRAPH), "example graph");
    expect(parseStoryboard(EXAMPLE_STORYBOARD, graph).ok).toBe(true);
    const used = new Set(
      EXAMPLE_STORYBOARD.scenes.flatMap((s) =>
        s.beats.flatMap((b) => b.actions.map((a) => a.type)),
      ),
    );
    expect([...used].sort()).toEqual([...ACTION_TYPES].sort());
    expect(guide).toContain(JSON.stringify(EXAMPLE_GRAPH, null, 2));
    expect(guide).toContain(JSON.stringify(EXAMPLE_STORYBOARD, null, 2));
  });

  it("tells the agent when to stop for the user's approval", () => {
    expect(guide).toMatch(/show the user the Mermaid.*wait/is);
    expect(guide).toMatch(/show the user the script.*wait/is);
  });
});

describe("shaping the story", () => {
  it("offers every story shape, each with what its beats do", () => {
    for (const shape of STORY_SHAPES) {
      expect(guide, shape.id).toContain(`"${shape.id}"`);
      expect(guide, shape.id).toContain(shape.label);
      expect(guide, shape.id).toContain(shape.beats);
    }
  });

  it("asks for the audience, the one takeaway and a hook, agreed with the user before the beats", () => {
    expect(guide).toMatch(/who the video is for/i);
    expect(guide).toMatch(/one thing.*remember/i);
    expect(guide).toMatch(/hook/i);
    const agree = guide.search(/agree the story with the user/i);
    const script = guide.search(/show the user the script/i);
    expect(agree).toBeGreaterThan(-1);
    expect(agree).toBeLessThan(script);
  });

  it("says which shape the worked example follows", () => {
    const shape = STORY_SHAPES.find((s) => s.id === EXAMPLE_SHAPE);
    expect(shape).toBeDefined();
    expect(guide).toMatch(new RegExp(`example follows the "${EXAMPLE_SHAPE}" shape`));
  });
});

describe("summaries for tool descriptions", () => {
  it("list each file's fields as the schemas have them, and point at the full guide", () => {
    const graph = graphSummary();
    const storyboard = storyboardSummary();
    expect(graph).toContain("graph.json is { version: 1, title, nodes, edges, zones }");
    expect(graph).toContain("a node { id, label, kind, icon?, zone?, category? }");
    expect(graph).toContain("an edge { id, from, to, label?, category? }");
    expect(storyboard).toContain("storyboard.json is { version: 1, scenes }");
    expect(storyboard).toContain("a beat { id, caption, say?, actions, notes? }");
    for (const kind of NODE_KINDS) expect(graph).toContain(kind);
    for (const action of ACTION_TYPES) expect(storyboard).toContain(action);
    for (const summary of [graph, storyboard]) {
      expect(summary).toContain("No other fields.");
      expect(summary).toContain(TOOL_NAMES.getGuide);
      expect(summary.length).toBeLessThan(700);
    }
  });
});
