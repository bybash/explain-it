import type { BeatWarning } from "../schema/checks.ts";
import { under, type Validated } from "../schema/errors.ts";
import { type Fix, WORD_FIELD_NAMES } from "../schema/fixes.ts";
import { type Graph, parseGraph } from "../schema/graph.ts";
import type { FloorPoint } from "../schema/layout.ts";
import { fail, ok } from "../schema/result.ts";
import { parseStoryboard, type Storyboard } from "../schema/storyboard.ts";

type Overrides = Readonly<Record<string, FloorPoint>>;

/** What a fix can change: the graph, the script and the positions set by hand. */
export type Fixable = {
  readonly graph: Graph;
  readonly storyboard: Storyboard;
  readonly overrides: Overrides;
};

/** The same fix the other way round: what undoing it applies. */
export const invert = (fix: Fix): Fix => {
  // Each kind on its own, so its before and after keep their own type.
  switch (fix.kind) {
    case "words":
      return { ...fix, before: fix.after, after: fix.before };
    case "layout":
      return { ...fix, before: fix.after, after: fix.before };
    case "rewrite":
      return { ...fix, before: fix.after, after: fix.before };
  }
};

const nodeList = (ids: readonly string[]) => ids.map((id) => `node "${id}"`).join(", ");

/** What a fix does, in a few words, as its button says it. */
export const describeFix = (fix: Fix): string => {
  switch (fix.kind) {
    case "words":
      return `Shorten the ${WORD_FIELD_NAMES[fix.field]} of beat "${fix.beat}"`;
    case "rewrite":
      return `Rewrite ${Object.keys(fix.after)
        .map((file) => `${file}.json`)
        .join(" and ")}`;
    case "layout":
      return `Lay out ${nodeList(dropped(fix))} again, in place of where it was put by hand`;
  }
};

/** The nodes a layout fix lays out again. */
const dropped = (fix: Extract<Fix, { kind: "layout" }>) =>
  Object.keys(fix.before).filter((id) => !(id in fix.after));

/** Whether the nodes a layout fix changes are where its `before` has them, put by hand or not. */
const asBefore = (overrides: Overrides, fix: Extract<Fix, { kind: "layout" }>) =>
  [...new Set([...Object.keys(fix.before), ...Object.keys(fix.after)])].every((id) => {
    const now = overrides[id];
    const then = fix.before[id];
    return now === undefined || then === undefined
      ? now === then
      : now.x === then.x && now.y === then.y;
  });

/**
 * The fixes the code can work out for what the checks found (decision 038),
 * without the LLM: laying out again the hand-placed nodes a layout problem
 * involves. A caption read too fast is not one: a step caption already
 * holds its beat as long as reading it takes, and a narration caption goes
 * at the voice's speed, so only fewer words fix it.
 */
export const fixesFor = (warnings: readonly BeatWarning[], overrides: Overrides): Fix[] => {
  const placed = new Set(
    warnings
      .filter((w) => w.check === "overlap" || w.check === "off-frame")
      .flatMap((w) => w.nodes ?? [])
      .filter((id) => id in overrides),
  );
  return placed.size === 0
    ? []
    : [
        {
          kind: "layout",
          before: Object.fromEntries(Object.entries(overrides).filter(([id]) => placed.has(id))),
          after: {},
        },
      ];
};

/** A document as text whose keys are in order, so two that hold the same are the same text. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

/**
 * The files a rewrite puts in place, read as the files are (the script
 * against the graph it will have), once each is as the rewrite found it.
 */
const rewritten = (
  files: Fixable,
  fix: Extract<Fix, { kind: "rewrite" }>,
): Validated<Partial<Fixable>> => {
  for (const file of ["graph", "storyboard"] as const)
    if (file in fix.before && canonical(files[file]) !== canonical(fix.before[file]))
      return changed(`${file}.json`);
  const graph = fix.after.graph === undefined ? undefined : parseGraph(fix.after.graph);
  if (graph && !graph.ok) return fail(under("graph.json", graph.errors));
  const storyboard =
    fix.after.storyboard === undefined
      ? undefined
      : parseStoryboard(fix.after.storyboard, graph?.value ?? files.graph);
  if (storyboard && !storyboard.ok) return fail(under("storyboard.json", storyboard.errors));
  return ok({
    ...(graph ? { graph: graph.value } : {}),
    ...(storyboard ? { storyboard: storyboard.value } : {}),
  });
};

/** Why a fix, or its undo, was refused: what it changes is no longer as it was. */
export const CHANGED_SINCE = "changed since the fix was offered; nothing was done";

const changed = (path: string) => fail([{ path, message: CHANGED_SINCE }]);

/**
 * A fix applied to what it changes: only the part it changes comes back,
 * for the caller to check and save. One whose `before` is no longer there
 * is refused, as the user, or the assistant, changed it since, and the fix
 * (or the undo) would undo their change.
 */
export const applyFix = (files: Fixable, fix: Fix): Validated<Partial<Fixable>> => {
  switch (fix.kind) {
    case "words": {
      for (const [i, scene] of files.storyboard.scenes.entries())
        for (const [j, beat] of scene.beats.entries()) {
          if (beat.id !== fix.beat) continue;
          const path = `scenes[${i}].beats[${j}].${fix.field}`;
          if (beat[fix.field] !== fix.before) return changed(path);
          return ok({
            storyboard: {
              ...files.storyboard,
              scenes: files.storyboard.scenes.map((s, si) =>
                si !== i
                  ? s
                  : {
                      ...s,
                      beats: s.beats.map((b, bj) =>
                        bj === j ? { ...b, [fix.field]: fix.after } : b,
                      ),
                    },
              ),
            },
          });
        }
      return fail([{ path: "beat", message: `no beat "${fix.beat}" in the script any more` }]);
    }
    case "rewrite":
      return rewritten(files, fix);
    case "layout": {
      if (!asBefore(files.overrides, fix)) return changed("layout.overrides");
      const kept = Object.entries(files.overrides).filter(([id]) => !(id in fix.before));
      return ok({ overrides: { ...Object.fromEntries(kept), ...fix.after } });
    }
  }
};
