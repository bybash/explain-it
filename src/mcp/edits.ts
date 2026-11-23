import jsonpatch, { type Operation } from "fast-json-patch";
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import { narrationMode } from "../engine/beats/timing.ts";
import { type Config, DEFAULT_CONFIG } from "../schema/config.ts";
import type { Validated, ValidationError } from "../schema/errors.ts";
import type { Graph } from "../schema/graph.ts";
import type { Narration } from "../schema/narration.ts";
import { GATES, type Gate } from "../schema/project.ts";
import { fail, ok } from "../schema/result.ts";
import type { Storyboard } from "../schema/storyboard.ts";

/** Puts a document's name in front of its errors' paths: `graph.nodes[0].kind`. */
export const under = (name: string, errors: readonly ValidationError[]): ValidationError[] =>
  errors.map((e) => ({
    path: e.path === "(root)" ? name : `${name}.${e.path}`,
    message: e.message,
  }));

/** Collects the errors of several checks, so the agent sees all of them at once. */
export const allOf = (...results: readonly Validated<unknown>[]): ValidationError[] =>
  results.flatMap((r) => (r.ok ? [] : r.errors));

/** The later of two gates: files arriving move a project forward, never back. */
export const laterGate = (current: Gate, reached: Gate): Gate =>
  GATES.indexOf(reached) > GATES.indexOf(current) ? reached : current;

/**
 * The new document from a whole one or a JSON Patch on the current one:
 * exactly one of the two. A failed patch step is named by its index.
 */
export const edited = (
  file: "graph" | "storyboard",
  current: unknown,
  whole: unknown,
  patch: unknown,
): Validated<unknown> => {
  if (whole === undefined && patch === undefined)
    return fail([{ path: "(arguments)", message: `give ${file} or patch` }]);
  if (whole !== undefined && patch !== undefined)
    return fail([{ path: "(arguments)", message: `give ${file} or patch, not both` }]);
  if (whole !== undefined) return ok(whole);
  if (current === null)
    return fail([
      { path: "patch", message: `${file}.json is missing or broken; send the whole ${file}` },
    ]);
  try {
    const patched = jsonpatch.applyPatch(
      structuredClone(current),
      patch as Operation[],
      true,
      false,
    );
    return ok(patched.newDocument);
  } catch (error) {
    const { index, message } = error as { index?: number; message: string };
    return fail([{ path: `patch[${index ?? 0}]`, message: message.split("\n")[0] ?? message }]);
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asObject = (value: unknown): Record<string, unknown> | undefined =>
  isPlainObject(value) ? value : undefined;

/**
 * `changes` laid over `base`, as a JSON Merge Patch (RFC 7386): objects
 * merge, `null` removes a key, and anything else replaces.
 */
export const merged = (base: unknown, changes: unknown): unknown => {
  if (!isPlainObject(changes)) return changes;
  const result: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(changes))
    if (value === null) delete result[key];
    else result[key] = merged(result[key], value);
  return result;
};

/**
 * Each scene's and the whole video's length, to a tenth of a second, and how
 * its narration lines were timed: measured from the voice, estimated from
 * their words, read (the voice is off), or unseen (nothing shows them).
 */
export const timingOf = (
  storyboard: Storyboard,
  graph: Graph,
  config: Config | null,
  narration: Narration = {},
) => {
  const project = config ?? DEFAULT_CONFIG;
  const plan = buildBeats(storyboard, graph, beatOptions(project, narration));
  const tenth = (seconds: number) => Math.round(seconds * 10) / 10;
  const mode = narrationMode(project);
  const said = storyboard.scenes.flatMap((scene) => scene.beats).filter((beat) => beat.say);
  const measured = mode === "spoken" ? said.filter((beat) => beat.id in narration).length : 0;
  return {
    duration: tenth(plan.duration),
    narration: {
      lines: said.length,
      measured,
      estimated: mode === "spoken" ? said.length - measured : 0,
      read: mode === "read" ? said.length : 0,
      unseen: mode === "unseen" ? said.length : 0,
    },
    scenes: plan.scenes.map((s) => ({
      id: s.id,
      title: s.title,
      start: tenth(s.start),
      end: tenth(s.end),
    })),
  };
};
