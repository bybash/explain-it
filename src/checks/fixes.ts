import type { BeatWarning } from "../schema/checks.ts";
import type { Validated } from "../schema/errors.ts";
import type { Fix } from "../schema/fixes.ts";
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
export const invert = (fix: Fix): Fix => ({ ...fix, before: fix.after, after: fix.before }) as Fix;

const FIELD_NAMES = { caption: "caption", say: "line" } as const;

const nodeList = (ids: readonly string[]) => ids.map((id) => `node "${id}"`).join(", ");

/** What a fix does, in a few words, as its button says it. */
export const describeFix = (fix: Fix): string => {
  switch (fix.kind) {
    case "words":
      return `Shorten the ${FIELD_NAMES[fix.field]} of beat "${fix.beat}"`;
    case "layout":
      return `Lay out ${nodeList(dropped(fix))} again, in place of where it was put by hand`;
  }
};

/** The nodes a layout fix lays out again. */
const dropped = (fix: Extract<Fix, { kind: "layout" }>) =>
  Object.keys(fix.before).filter((id) => !(id in fix.after));

const samePlaces = (a: Overrides, b: Overrides) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([id, p]) => b[id]?.x === p.x && b[id]?.y === p.y);

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
          before: overrides,
          after: Object.fromEntries(Object.entries(overrides).filter(([id]) => !placed.has(id))),
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
    case "layout":
      return samePlaces(files.overrides, fix.before)
        ? ok({ overrides: fix.after })
        : changed("layout.overrides");
  }
};
