import { CAPTION_CHARS_PER_SECOND, WORDS_PER_SECOND } from "../engine/beats/timing.ts";
import { KIND_STYLES } from "../engine/theme/kinds.ts";
import { PALETTES } from "../engine/theme/palettes.ts";
import { MAX_ID_LENGTH } from "../schema/common.ts";
import {
  CARD_LIMITS,
  LOGO_CORNERS,
  LOGO_MAX_MB,
  LOGO_SHOWS,
  LOGO_TYPES,
  MAX_CATEGORY_COLOURS,
  THEME_MODES,
} from "../schema/config.ts";
import {
  MAX_GRAPH_NODES,
  MAX_NODE_LABEL,
  MAX_TITLE,
  MERMAID_KEYWORDS,
  NODE_KINDS,
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
  MIN_BEATS,
  MIN_SCENES,
} from "../schema/storyboard.ts";
import { EXAMPLE_GRAPH, EXAMPLE_STORYBOARD } from "./example.ts";

/**
 * The authoring guidance: what an agent or the in-app LLM needs to write a
 * good project. Every limit and list comes from the schemas, so the text
 * cannot drift from what the tools accept (AGENTS.md: one source of truth).
 */

const quoted = (words: readonly string[]) => words.map((w) => `"${w}"`).join(" | ");
const listed = (words: readonly string[]) => words.map((w) => `"${w}"`).join(", ");
const categories = [
  "accent",
  "muted",
  ...Array.from({ length: MAX_CATEGORY_COLOURS }, (_, i) => `c${i + 1}`),
];
const json = (value: unknown) => JSON.stringify(value, null, 2);

const STEPS = `## Steps

1. Read the code or the description the user gave you, and find the flow: who and what takes part, and what passes between them.
2. Write graph.json and call \`create_project\` (pass \`sources\`: the files you read, with the commit). Show the user the Mermaid from the result and the preview link, then wait for them to approve or ask for changes. Change it with \`update_graph\` (a whole graph or a JSON Patch).
3. Write storyboard.json and call \`set_storyboard\`. Show the user the script: each scene's title, then each beat's caption and narration, with the estimated timing from the result. Wait for their approval; change it with \`set_storyboard\` again.
4. Optionally call \`set_style\`: a palette, a title card that names the video, an end card with a link, a logo.
5. Point the user at the preview link to watch it.

Every tool result carries a preview link to the project in the web app. When a tool returns errors, each one names its place (\`graph.nodes[2].kind: …\`): fix those and call it again.`;

const GRAPH = `## graph.json: the structure

\`\`\`ts
type Graph = {
  version: 1;
  title: string;        // ≤ ${MAX_TITLE} characters
  nodes: Node[];        // at most ${MAX_GRAPH_NODES} nodes
  edges: Edge[];
  zones: Zone[];        // groups of nodes, drawn as a platform under them
};
type Node = {
  id: string;           // [a-z][a-z0-9_]*, ≤ ${MAX_ID_LENGTH} characters; not one of Mermaid's words: ${listed(MERMAID_KEYWORDS)}
  label: string;        // shown on the node, ≤ ${MAX_NODE_LABEL} characters
  kind: ${quoted(NODE_KINDS)};
  icon?: string;        // a Lucide icon name (lucide.dev), e.g. "database"
  zone?: string;        // a zone id
  category?: string;    // a palette colour: ${listed(categories)}
};
type Edge = { id: string; from: string; to: string; label?: string };   // label ≤ ${MAX_NODE_LABEL} characters
type Zone = { id: string; label: string; category?: string };          // label ≤ ${MAX_NODE_LABEL} characters
\`\`\`

Each kind has a size, colour and icon of its own; give an icon or category only to change them:
${NODE_KINDS.map((kind) => `- "${kind}": icon "${KIND_STYLES[kind].icon}", category "${KIND_STYLES[kind].category}"`).join("\n")}

Keep ids stable across edits: the storyboard refers to them. Keep labels short; put detail in the storyboard instead. Edges carry the flow, so their direction matters.`;

const STORYBOARD = `## storyboard.json: the story

\`\`\`ts
type Storyboard = {
  version: 1;
  scenes: Scene[];      // ${MIN_SCENES}–${MAX_SCENES} scenes
};
type Scene = {
  id: string;
  title: string;        // shown as "1 · Title", ≤ ${MAX_CAPTION} characters
  nodes: string[];      // the graph nodes in this scene, ≤ ${MAX_SCENE_NODES} nodes
  beats: Beat[];        // ${MIN_BEATS}–${MAX_BEATS} beats
};
type Beat = {
  id: string;
  caption: string;      // the step caption on screen, ≤ ${MAX_CAPTION} characters
  say?: string;         // the narration line, ≤ ${MAX_SAY} characters
  actions: Action[];
  notes?: string;       // your own notes; never shown
};
type Action =
  | { type: "appear"; node: string }                      // the node rises into the scene
  | { type: "flow"; edge: string; label?: string }        // the edge draws in and carries a dot; label ≤ ${MAX_CAPTION} characters
  | { type: "highlight"; node: string }                   // the node pulses
  | { type: "callout"; node: string; title?: string; text: string }   // a card beside the node; title ≤ ${MAX_CALLOUT_TITLE} characters, text ≤ ${MAX_CALLOUT_TEXT} characters
  | { type: "dim"; except: string[] }                     // everything but these nodes fades back
  | { type: "badge"; node: string; text: string; tone: ${quoted(BADGE_TONES)} };   // a chip on the node, text ≤ ${MAX_BADGE_TEXT} characters
\`\`\`

The actions are ${listed(ACTION_TYPES)}. Every id must be unique. A scene's beats may only name nodes in that scene, and a flow's edge must join two of them. Nodes without an \`appear\` are there from the scene's start.`;

const STORY = `## Telling the story

- One idea per beat: one step of the flow, said once.
- The caption names the step; the narration explains why it matters. Write narration as you would say it, in short sentences. It is read at about ${WORDS_PER_SECOND} words a second, and that sets the beat's length; a beat without narration lasts at least its caption's length at ${CAPTION_CHARS_PER_SECOND} characters a second.
- Show before you tell: \`appear\` a node or \`flow\` an edge in the beat that first talks about it.
- Use \`callout\` for the one detail a viewer must remember, \`badge\` for a result (ok, error), \`highlight\` to point, and \`dim\` to focus on a few nodes.
- Use scenes for the parts of a longer story, each with the nodes it needs. One scene is often enough.
- End on the outcome: what the user has at the end of the flow.`;

const STYLE = `## Style (optional, set_style)

Settings merge into config.json: objects merge, \`null\` removes a setting, anything else replaces it.

- \`cards.title\`: \`{ title, description? }\` opens the video; title ≤ ${CARD_LIMITS.title} characters, description ≤ ${CARD_LIMITS.description} characters.
- \`cards.end\`: \`{ headline, link?, where?, credit? }\` closes it, with the link as a QR code; headline ≤ ${CARD_LIMITS.headline} characters, link ≤ ${CARD_LIMITS.link} characters (http or https), where and credit ≤ ${CARD_LIMITS.where} characters.
- \`theme\`: \`{ palette, mode }\`; palette ${quoted(Object.keys(PALETTES))}, mode ${quoted(THEME_MODES)}.
- The logo goes in \`set_style\`'s \`logo\` argument: \`{ light?, dark?, corner?, show? }\`, each image as \`{ path }\` (an absolute path) or \`{ dataUrl }\`; ${Object.keys(LOGO_TYPES).join(", ")}, at most ${LOGO_MAX_MB} MB. corner ${quoted(LOGO_CORNERS)}; show ${quoted(LOGO_SHOWS)}.`;

const EXAMPLE = `## A worked example

graph.json:

\`\`\`json
${json(EXAMPLE_GRAPH)}
\`\`\`

storyboard.json:

\`\`\`json
${json(EXAMPLE_STORYBOARD)}
\`\`\``;

/** The whole guide: the MCP prompt `explain_flow`, the `get_guide` tool, and later the in-app LLM's prompts. */
export const authoringGuide = (): string =>
  [
    "# Making an explAIn-it video",
    "explAIn-it turns a flow into a short isometric explainer video. You describe the flow as a graph, then tell its story in scenes and beats; explAIn-it lays it out, animates it and renders it.",
    STEPS,
    GRAPH,
    STORYBOARD,
    STORY,
    STYLE,
    EXAMPLE,
  ].join("\n\n");

/** A few lines on graph.json for the tool descriptions; the guide has the rest. */
export const graphSummary = (): string =>
  `graph.json: { version: 1, title, nodes, edges, zones }. A node is { id, label (≤ ${MAX_NODE_LABEL} chars), kind: ${NODE_KINDS.join(" | ")}, icon?, zone?, category? }; an edge { id, from, to, label? }; a zone { id, label }. Ids are [a-z][a-z0-9_]* and not Mermaid words such as "end". At most ${MAX_GRAPH_NODES} nodes. Call get_guide first for the full format, how to tell the story, and a worked example.`;

/** A few lines on storyboard.json for the tool descriptions; the guide has the rest. */
export const storyboardSummary = (): string =>
  `storyboard.json: { version: 1, scenes: ${MIN_SCENES}–${MAX_SCENES} }. A scene is { id, title, nodes (≤ ${MAX_SCENE_NODES}), beats: ${MIN_BEATS}–${MAX_BEATS} }; a beat { id, caption (≤ ${MAX_CAPTION} chars), say?, actions }. Actions: ${ACTION_TYPES.join(", ")}; they may only name the scene's own nodes. Call get_guide first for the full format, how to tell the story, and a worked example.`;
