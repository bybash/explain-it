import type { BeatWarning } from "../schema/checks.ts";
import type { Validated } from "../schema/errors.ts";
import { type Fix, WORD_FIELD_NAMES } from "../schema/fixes.ts";
import type { FloorPoint } from "../schema/layout.ts";
import { fail, ok } from "../schema/result.ts";
import type { Storyboard } from "../schema/storyboard.ts";

type Overrides = Readonly<Record<string, FloorPoint>>;

/** What a fix can change: the script and the positions set by hand. */
export type Fixable = {
  readonly storyboard: Storyboard;
  readonly overrides: Overrides;
};

/** The same fix the other way round: what undoing it applies. */
export const invert = (fix: Fix): Fix =>
  // Each kind on its own, so its before and after keep their own type.
  fix.kind === "words"
    ? { ...fix, before: fix.after, after: fix.before }
    : { ...fix, before: fix.after, after: fix.before };

const nodeList = (ids: readonly string[]) => ids.map((id) => `node "${id}"`).join(", ");

/** What a fix does, in a few words, as its button says it. */
export const describeFix = (fix: Fix): string => {
  switch (fix.kind) {
    case "words":
      return `Shorten the ${WORD_FIELD_NAMES[fix.field]} of beat "${fix.beat}"`;
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

const changed = (path: string) =>
  fail([{ path, message: "changed since the fix was offered; nothing was done" }]);

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
    case "layout": {
      if (!asBefore(files.overrides, fix)) return changed("layout.overrides");
      const kept = Object.entries(files.overrides).filter(([id]) => !(id in fix.before));
      return ok({ overrides: { ...Object.fromEntries(kept), ...fix.after } });
    }
  }
};
