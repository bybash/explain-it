import { z } from "zod";
import { CAPTION_CHARS_PER_SECOND, WORDS_PER_SECOND } from "../engine/beats/timing.ts";
import { FONTS } from "../engine/theme/fonts.ts";
import { CATEGORIES, KIND_STYLES } from "../engine/theme/kinds.ts";
import { PALETTES } from "../engine/theme/palettes.ts";
import { ConfigSchema } from "../schema/config.ts";
import {
  GraphEdgeSchema,
  GraphNodeSchema,
  GraphSchema,
  MAX_NODE_LABEL,
  MERMAID_EDGE_KEYWORDS,
  MERMAID_KEYWORDS,
  NODE_KINDS,
  ZoneSchema,
} from "../schema/graph.ts";
import { TOOL_NAMES } from "../schema/mcp.ts";
import { BriefSchema, HOOK_SECONDS, STORY_SHAPES, TARGET_SECONDS } from "../schema/story.ts";
import { ACTION_TYPES, BeatSchema, SceneSchema, StoryboardSchema } from "../schema/storyboard.ts";
import { EXAMPLE_BRIEF, EXAMPLE_GRAPH, EXAMPLE_STORYBOARD } from "./example.ts";
import { schemaShape } from "./shape.ts";

/**
 * The authoring guidance: what an agent or the in-app LLM needs to write a
 * good project. The file formats are generated from the schemas and every
 * list comes from the code, so the text cannot drift from what the tools
 * accept (AGENTS.md: one source of truth).
 */

/** `"a" | "b"`: the values a field takes. */
const union = (words: readonly string[]) => words.map((w) => `"${w}"`).join(" | ");
/** `"a", "b"`: a list in a sentence. */
const commaList = (words: readonly string[]) => words.map((w) => `"${w}"`).join(", ");
const json = (value: unknown) => JSON.stringify(value, null, 2);
const ts = (code: string) => `\`\`\`ts\n${code}\n\`\`\``;
const T = TOOL_NAMES;

export const GRAPH_SHAPE_NAMES = { nodes: "Node", edges: "Edge", zones: "Zone" } as const;
export const STORYBOARD_SHAPE_NAMES = {
  scenes: "Scene",
  beats: "Beat",
  actions: "Action",
} as const;

/** A schema's top-level fields as `{ version: 1, a, b? }`, for the short summaries. */
const fieldsOf = (schema: z.ZodType): string => {
  const shape = z.toJSONSchema(schema, { io: "input" }) as {
    properties?: Record<string, { const?: unknown }>;
    required?: string[];
  };
  const required = new Set(shape.required ?? []);
  const fields = Object.entries(shape.properties ?? {})
    .filter(([key]) => key !== "$schema")
    .map(([key, field]) =>
      field.const !== undefined
        ? `${key}: ${JSON.stringify(field.const)}`
        : required.has(key)
          ? key
          : `${key}?`,
    );
  return `{ ${fields.join(", ")} }`;
};

const STEPS = `## Steps

1. Read the code or the description the user gave you, and find the flow: who and what takes part, and what passes between them.
2. Write graph.json and call \`${T.createProject}\` (pass \`sources\`: the files you read, with the commit). Show the user the Mermaid from the result and the preview link, then wait for them to approve or ask for changes. Change it with \`${T.updateGraph}\` (a whole graph or a JSON Patch).
3. Agree the story with the user before writing any beat: who the video is for, the one thing they should remember, the shape it takes and its hook (see Shaping the story). Wait for their approval, then call \`${T.setBrief}\` with it as brief.json, so the story is kept with the project. A brief may already be there (\`${T.getProject}\` returns it): start from it, and follow its notes.
4. Write storyboard.json and call \`${T.setStoryboard}\`. Show the user the script: each scene's title, then each beat's caption and narration, with the timing from the result (estimated until the voice is generated). Wait for their approval; change it with \`${T.setStoryboard}\` again.
5. Optionally call \`${T.setStyle}\`: a palette, a title card that names the video, an end card with a link, a logo.
6. Point the user at the preview link to watch it.
7. When the user wants the video, call \`${T.check}\` to see that the project is ready (it also generates the narration voice, which can take a minute the first time, and lists problems by beat: shorter labels or fewer nodes in a scene fix most layout ones, and a shorter caption or line, or a slower pace, fixes reading speed), then \`${T.render}\`. Follow the job with \`${T.renderStatus}\` until it is done, and give the user the paths of the files it wrote; \`${T.cancelRender}\` stops it. Rendering takes about half a minute per minute of video, per theme.

Every tool result carries a preview link to the project in the web app. When a tool returns errors, each one names its place (\`graph.nodes[2].kind: …\`): fix those and call it again. Use \`${T.listProjects}\` and \`${T.getProject}\` to pick up a project you made before.

Every object below takes exactly the fields shown: any other field, such as a \`description\` on a node, is an error.`;

const GRAPH = `## graph.json: the structure

${ts(schemaShape("Graph", GraphSchema, GRAPH_SHAPE_NAMES))}

- Every id in graph.json is unique across nodes, edges and zones together.
- Node and zone ids may not be one of Mermaid's words: ${commaList(MERMAID_KEYWORDS)}. Edge ids may not be ${commaList(MERMAID_EDGE_KEYWORDS)}.
- An edge's \`from\` and \`to\` and a node's \`zone\` name ids in the graph. Edges carry the flow, so their direction matters.
- An icon is a Lucide name as lucide.dev shows it (kebab-case, such as "shield-check"); an unknown one is an error.
- A category is one of ${commaList(CATEGORIES)}.
- Each kind has a size, colour and icon of its own; give an icon or category only to change them:
${NODE_KINDS.map((kind) => `  - "${kind}": icon "${KIND_STYLES[kind].icon}", category "${KIND_STYLES[kind].category}"`).join("\n")}

Keep ids stable across edits: the storyboard refers to them. Keep labels short; put the detail in the storyboard.`;

const STORYBOARD = `## storyboard.json: the story

${ts(schemaShape("Storyboard", StoryboardSchema, STORYBOARD_SHAPE_NAMES))}

- Scene and beat ids are unique across the whole storyboard.
- A scene's \`nodes\` are graph node ids. Its beats' actions may only name those nodes, and a flow's edge must join two of them.
- A node without an \`appear\` is there from the scene's start.`;

const SHAPE = `## Shaping the story

A video is watched once, often without sound at first, by someone who did not ask for it. Settle the story before the beats:

- **Who it is for.** A new developer, the product team, a reviewer: it sets what they already know and which words need explaining.
- **The one thing to remember.** One sentence. Every beat serves it; leave out what does not, however true.
- **The shape.** One of:
${STORY_SHAPES.map((s) => `  - ${s.label} ("${s.id}"): ${s.beats}. For ${s.suits}.`).join("\n")}
- **The hook.** The first beat's line says, in under ${HOOK_SECONDS} seconds (about ${Math.floor(HOOK_SECONDS * WORDS_PER_SECOND)} words), the problem or the question the video answers, so the viewer wants the rest.
- **The length.** Aim for ${TARGET_SECONDS.min} to ${TARGET_SECONDS.max} seconds. Longer is fine for a longer flow, split into scenes.`;

const BRIEF = `## brief.json: the story brief (\`${T.setBrief}\`)

${ts(schemaShape("Brief", BriefSchema))}

- Every field but \`version\` is optional; \`${T.setBrief}\` replaces the whole brief.
- \`notes\` are the user's own rules for this project's story. Follow them as you follow the house rules.`;

const STORY = `## Telling the story

- One idea per beat: one step of the flow, said once.
- The caption names the step; the narration explains why it matters. Write narration as you would say it, in short sentences. It is read at about ${WORDS_PER_SECOND} words a second, and that sets the beat's length; a beat without narration lasts at least its caption's length at ${CAPTION_CHARS_PER_SECOND} characters a second.
- Show before you tell: \`appear\` a node or \`flow\` an edge in the beat that first talks about it.
- Use \`callout\` for the one detail a viewer must remember, \`badge\` for a result, \`highlight\` to point, and \`dim\` to focus on a few nodes.
- Use scenes for the parts of a longer story, each with the nodes it needs. One scene is often enough.
- End on the outcome: show what the user has at the end of the flow.`;

const STYLE = `## config.json: style (optional, \`${T.setStyle}\`)

${ts(schemaShape("Config", ConfigSchema))}

- Settings merge into config.json: objects merge, \`null\` removes a setting, anything else replaces it.
- A palette is one of ${union(Object.keys(PALETTES))}, or your own colours. A font is one of ${union(FONTS.map((f) => f.id))}.
- Send a logo in \`${T.setStyle}\`'s \`logo\` argument, \`{ light?, dark?, corner?, show? }\`, each image as \`{ path }\` (an absolute path) or \`{ dataUrl }\`. It is checked and copied into the project; config.json then names its file.`;

const EXAMPLE = `## A worked example

The example follows the "${EXAMPLE_BRIEF.shape}" shape: the first beat names the problem, the middle beats walk through the flow, and the last shows the outcome.

brief.json:

\`\`\`json
${json(EXAMPLE_BRIEF)}
\`\`\`

graph.json:

\`\`\`json
${json(EXAMPLE_GRAPH)}
\`\`\`

storyboard.json:

\`\`\`json
${json(EXAMPLE_STORYBOARD)}
\`\`\``;

/** The user's house rules, above the advice they override; nothing when there are none. */
const houseRulesSection = (rules: string) =>
  rules.trim() === ""
    ? []
    : [
        `## House rules

The user's own rules for every video. Follow them, over any advice below.

${rules.trim()}`,
      ];

/**
 * The whole guide: the MCP prompt \`explain_flow\`, the \`get_guide\` tool, and
 * later the in-app LLM's prompts; with the user's house rules when they have
 * written any (\`house-rules.md\`).
 */
export const authoringGuide = ({
  houseRules = "",
}: {
  readonly houseRules?: string;
} = {}): string =>
  [
    "# Making an explAIn-it video",
    "explAIn-it turns a flow into a short isometric explainer video. You describe the flow as a graph, then tell its story in scenes and beats; explAIn-it lays it out, animates it and renders it.",
    ...houseRulesSection(houseRules),
    STEPS,
    GRAPH,
    STORYBOARD,
    SHAPE,
    BRIEF,
    STORY,
    STYLE,
    EXAMPLE,
  ].join("\n\n");

const SEE_GUIDE = `Call ${T.getGuide} first for the full formats, how to tell the story, and a worked example.`;

/** A few lines on graph.json for the tool descriptions; the guide has the rest. */
export const graphSummary = (): string =>
  `graph.json is ${fieldsOf(GraphSchema)}; a node ${fieldsOf(GraphNodeSchema)} with kind ${union(NODE_KINDS)}; an edge ${fieldsOf(GraphEdgeSchema)}; a zone ${fieldsOf(ZoneSchema)}. No other fields. Labels ≤ ${MAX_NODE_LABEL} characters. Ids are unique across nodes, edges and zones, and a node or zone id may not be a Mermaid word such as "end". ${SEE_GUIDE}`;

/** A few lines on storyboard.json for the tool descriptions; the guide has the rest. */
export const storyboardSummary = (): string =>
  `storyboard.json is ${fieldsOf(StoryboardSchema)}; a scene ${fieldsOf(SceneSchema)}; a beat ${fieldsOf(BeatSchema)}. No other fields. Actions: ${ACTION_TYPES.join(", ")}; they may only name the scene's own nodes. ${SEE_GUIDE}`;
