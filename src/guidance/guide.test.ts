import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PALETTES } from "../engine/theme/palettes.ts";
import { CARD_LIMITS, LOGO_CORNERS, LOGO_SHOWS, THEME_MODES } from "../schema/config.ts";
import { orThrow } from "../schema/errors.ts";
import {
  GraphSchema,
  MAX_GRAPH_NODES,
  MAX_NODE_LABEL,
  MAX_TITLE,
  MERMAID_KEYWORDS,
  NODE_KINDS,
  parseGraph,
} from "../schema/graph.ts";
import {
  ACTION_TYPES,
  BADGE_TONES,
  MAX_BADGE_TEXT,
  MAX_BEATS,
  MAX_CALLOUT_TEXT,
  MAX_CALLOUT_TITLE,
  MAX_CAPTION,
  MAX_SAY,
  MAX_SCENE_NODES,
  MAX_SCENES,
  parseStoryboard,
  StoryboardSchema,
} from "../schema/storyboard.ts";
import { EXAMPLE_GRAPH, EXAMPLE_STORYBOARD } from "./example.ts";
import { authoringGuide, graphSummary, storyboardSummary } from "./guide.ts";

const guide = authoringGuide();

/** Every property name anywhere in a JSON Schema, through arrays and unions. */
const propertyNames = (schema: unknown): Set<string> => {
  const names = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    const properties = record.properties as Record<string, unknown> | undefined;
    if (properties)
      for (const [name, value] of Object.entries(properties)) {
        names.add(name);
        walk(value);
      }
    for (const key of ["items", "anyOf", "oneOf", "allOf"]) walk(record[key]);
  };
  walk(schema);
  names.delete("$schema");
  return names;
};

describe("authoringGuide", () => {
  it("documents every field of graph.json and storyboard.json", () => {
    for (const schema of [GraphSchema, StoryboardSchema])
      for (const name of propertyNames(z.toJSONSchema(schema, { io: "input" })))
        expect(guide, name).toMatch(new RegExp(`\\b${name}\\??:`));
  });

  it("names every node kind, action, badge tone and Mermaid keyword", () => {
    for (const word of [...NODE_KINDS, ...ACTION_TYPES, ...BADGE_TONES, ...MERMAID_KEYWORDS])
      expect(guide, word).toContain(`"${word}"`);
  });

  it("states the limits the schemas set", () => {
    for (const limit of [
      `at most ${MAX_GRAPH_NODES} nodes`,
      `≤ ${MAX_NODE_LABEL} characters`,
      `≤ ${MAX_TITLE} characters`,
      `1–${MAX_SCENES} scenes`,
      `≤ ${MAX_SCENE_NODES} nodes`,
      `${MAX_BEATS} beats`,
      `≤ ${MAX_CAPTION} characters`,
      `≤ ${MAX_SAY} characters`,
      `≤ ${MAX_CALLOUT_TITLE} characters`,
      `≤ ${MAX_CALLOUT_TEXT} characters`,
      `≤ ${MAX_BADGE_TEXT} characters`,
      `≤ ${CARD_LIMITS.headline} characters`,
      `≤ ${CARD_LIMITS.description} characters`,
    ])
      expect(guide, limit).toContain(limit);
    for (const word of [...LOGO_CORNERS, ...LOGO_SHOWS, ...THEME_MODES, ...Object.keys(PALETTES)])
      expect(guide, word).toContain(`"${word}"`);
  });

  it("carries a worked example that validates", () => {
    const graph = orThrow(parseGraph(EXAMPLE_GRAPH), "example graph");
    expect(parseStoryboard(EXAMPLE_STORYBOARD, graph).ok).toBe(true);
    expect(guide).toContain(JSON.stringify(EXAMPLE_GRAPH, null, 2));
    expect(guide).toContain(JSON.stringify(EXAMPLE_STORYBOARD, null, 2));
  });

  it("tells the agent when to stop for the user's approval", () => {
    expect(guide).toMatch(/show the user the Mermaid.*wait/is);
    expect(guide).toMatch(/show the user the script.*wait/is);
  });
});

describe("summaries for tool descriptions", () => {
  it("are short, name the essentials, and point at the full guide", () => {
    const graph = graphSummary();
    const storyboard = storyboardSummary();
    for (const kind of NODE_KINDS) expect(graph).toContain(kind);
    for (const action of ACTION_TYPES) expect(storyboard).toContain(action);
    for (const summary of [graph, storyboard]) {
      expect(summary).toContain("get_guide");
      expect(summary.length).toBeLessThan(700);
    }
  });
});
