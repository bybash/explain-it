import { z } from "zod";
import { IdSchema, referenceErrors } from "./common.ts";
import { parseWith, type Validated } from "./errors.ts";
import type { Graph } from "./graph.ts";
import { fail } from "./result.ts";

export const MIN_SCENES = 1;
export const MAX_SCENES = 3;
export const MAX_SCENE_NODES = 12;
export const MIN_BEATS = 3;
export const MAX_BEATS = 10;
export const MAX_CAPTION = 60;
export const MAX_SAY = 300;
export const MAX_CALLOUT_TITLE = 40;
export const MAX_CALLOUT_TEXT = 140;
export const MAX_BADGE_TEXT = 16;

export const ACTION_TYPES = ["appear", "flow", "highlight", "callout", "dim", "badge"] as const;
export const BADGE_TONES = ["info", "ok", "warn", "error"] as const;

export const ActionSchema = z.discriminatedUnion("type", [
  z
    .strictObject({ type: z.literal("appear"), node: IdSchema })
    .describe("The node rises into the scene."),
  z
    .strictObject({
      type: z.literal("flow"),
      edge: IdSchema,
      label: z.string().min(1).max(MAX_CAPTION).optional(),
    })
    .describe("The edge draws in and carries a moving dot."),
  z
    .strictObject({ type: z.literal("highlight"), node: IdSchema })
    .describe("The node pulses to draw attention."),
  z
    .strictObject({
      type: z.literal("callout"),
      node: IdSchema,
      title: z.string().min(1).max(MAX_CALLOUT_TITLE).optional(),
      text: z.string().min(1).max(MAX_CALLOUT_TEXT),
    })
    .describe("A card with text next to the node, shown until the narration ends."),
  z
    .strictObject({ type: z.literal("dim"), except: z.array(IdSchema).min(1) })
    .describe("Everything but these nodes fades back."),
  z
    .strictObject({
      type: z.literal("badge"),
      node: IdSchema,
      text: z.string().min(1).max(MAX_BADGE_TEXT),
      tone: z.enum(BADGE_TONES),
    })
    .describe("A small status chip on the node."),
]);

export const BeatSchema = z.strictObject({
  id: IdSchema,
  caption: z.string().min(1).max(MAX_CAPTION).describe("The step caption shown on screen."),
  say: z
    .string()
    .min(1)
    .max(MAX_SAY)
    .optional()
    .describe("The narration line. Without it the beat is timed by its actions and caption."),
  actions: z.array(ActionSchema),
  notes: z.string().optional().describe("The author's own notes; never shown."),
});

export const SceneSchema = z.strictObject({
  id: IdSchema,
  title: z.string().min(1).max(MAX_CAPTION).describe('Shown as "1 · Title".'),
  nodes: z
    .array(IdSchema)
    .min(1)
    .max(MAX_SCENE_NODES)
    .describe("The graph nodes shown in this scene."),
  beats: z.array(BeatSchema).min(MIN_BEATS).max(MAX_BEATS),
});

export const StoryboardSchema = z
  .strictObject({
    version: z.literal(1),
    scenes: z.array(SceneSchema).min(MIN_SCENES).max(MAX_SCENES),
  })
  .describe("The story told over a graph: scenes, and beats within them.");

export type Storyboard = z.output<typeof StoryboardSchema>;
export type Scene = z.output<typeof SceneSchema>;
export type Beat = z.output<typeof BeatSchema>;
export type Action = z.output<typeof ActionSchema>;

/** Validates shape first, then every reference against `graph`. */
export const parseStoryboard = (data: unknown, graph: Graph): Validated<Storyboard> => {
  const shape = parseWith(StoryboardSchema, data);
  if (!shape.ok) return shape;
  const errors = storyboardReferenceErrors(shape.value, graph);
  return errors.length === 0 ? shape : fail(errors);
};

const storyboardReferenceErrors = (storyboard: Storyboard, graph: Graph) => {
  const { errors, add } = referenceErrors();
  const graphNodes = new Set(graph.nodes.map((node) => node.id));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const seen = new Set<string>();
  const unique = (id: string, path: readonly PropertyKey[]) => {
    if (seen.has(id)) add(path, `duplicate id "${id}"`);
    seen.add(id);
  };

  storyboard.scenes.forEach((scene, s) => {
    unique(scene.id, ["scenes", s, "id"]);
    scene.nodes.forEach((node, n) => {
      if (!graphNodes.has(node)) add(["scenes", s, "nodes", n], `unknown node "${node}"`);
    });

    const inScene = new Set(scene.nodes);
    const notInScene = (node: string) => `"${node}" is not in scene "${scene.id}"`;

    scene.beats.forEach((beat, b) => {
      unique(beat.id, ["scenes", s, "beats", b, "id"]);
      beat.actions.forEach((action, a) => {
        const path = ["scenes", s, "beats", b, "actions", a];
        switch (action.type) {
          case "flow": {
            const edge = edges.get(action.edge);
            if (!edge) {
              add([...path, "edge"], `unknown edge "${action.edge}"`);
              break;
            }
            const outside = [edge.from, edge.to].find((node) => !inScene.has(node));
            if (outside !== undefined)
              add(
                [...path, "edge"],
                `"${action.edge}" connects "${outside}", which is not in scene "${scene.id}"`,
              );
            break;
          }
          case "dim":
            action.except.forEach((node, e) => {
              if (!inScene.has(node)) add([...path, "except", e], notInScene(node));
            });
            break;
          default:
            if (!inScene.has(action.node)) add([...path, "node"], notInScene(action.node));
        }
      });
    });
  });
  return errors;
};
