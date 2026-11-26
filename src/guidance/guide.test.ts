import { describe, expect, it } from "vitest";
import { PALETTES } from "../engine/theme/palettes.ts";
import { CATEGORIES } from "../schema/colours.ts";
import { ConfigSchema } from "../schema/config.ts";
import { orThrow, parseWith } from "../schema/errors.ts";
import { GraphSchema, MERMAID_KEYWORDS, NODE_KINDS, parseGraph } from "../schema/graph.ts";
import { TOOL_NAMES } from "../schema/mcp.ts";
import { BriefSchema, STORY_SHAPES } from "../schema/story.ts";
import { ACTION_TYPES, parseStoryboard, StoryboardSchema } from "../schema/storyboard.ts";
import { EXAMPLE_BRIEF, EXAMPLE_GRAPH, EXAMPLE_STORYBOARD } from "./example.ts";
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

  it("says which shape the worked example follows, in a brief that validates", () => {
    const brief = orThrow(parseWith(BriefSchema, EXAMPLE_BRIEF), "example brief");
    expect(STORY_SHAPES.map((s) => s.id)).toContain(brief.shape);
    expect(guide).toMatch(new RegExp(`example follows the "${brief.shape}" shape`));
    expect(guide).toContain(JSON.stringify(EXAMPLE_BRIEF, null, 2));
  });

  it("gives the brief's format, and saves it with set_brief before the beats", () => {
    expect(guide).toContain(schemaShape("Brief", BriefSchema));
    const brief = guide.search(new RegExp(`call \`${TOOL_NAMES.setBrief}\``));
    expect(brief).toBeGreaterThan(-1);
    expect(brief).toBeLessThan(guide.search(/show the user the script/i));
  });
});

describe("house rules", () => {
  it("puts the user's house rules near the top, above the advice they override", () => {
    const rules = "- No jargon.\n- End with a link to the docs.";
    const withRules = authoringGuide({ houseRules: rules });
    expect(withRules).toContain(`## House rules`);
    expect(withRules).toContain(rules);
    expect(withRules.indexOf(rules)).toBeLessThan(withRules.indexOf("## Steps"));
  });

  it("leaves the guide as it is when there are none", () => {
    expect(authoringGuide({ houseRules: "" })).toBe(guide);
    expect(authoringGuide({ houseRules: "  \n" })).toBe(guide);
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

describe("the guide where it is read", () => {
  const inApp = authoringGuide({ where: "app" });

  it("tells an agent in the app that the panel shows the files, so it never pastes them", () => {
    expect(inApp).toMatch(/never paste the graph, its Mermaid or the script/i);
    expect(inApp).not.toMatch(/show the user the Mermaid/i);
    expect(inApp).not.toMatch(/show the user the script/i);
    expect(inApp).not.toMatch(/preview link/i);
    expect(inApp).not.toContain(TOOL_NAMES.createProject);
    expect(inApp).not.toContain(TOOL_NAMES.listProjects);
  });

  it("keeps the same approvals, in the same order, as over MCP", () => {
    const order = (text: string, patterns: readonly RegExp[]) =>
      patterns.map((p) => text.search(p));
    const found = order(inApp, [
      /ask whether the graph is right/i,
      /agree the story/i,
      /ask whether the script is right/i,
    ]);
    expect(found.every((i) => i >= 0)).toBe(true);
    expect(found).toEqual([...found].sort((a, b) => a - b));
  });

  it("is otherwise the same guide, and the IDE's is the default", () => {
    expect(authoringGuide({ where: "ide" })).toBe(guide);
    const afterSteps = (text: string) => text.slice(text.indexOf("## graph.json"));
    expect(afterSteps(inApp)).toBe(afterSteps(guide));
  });
});
