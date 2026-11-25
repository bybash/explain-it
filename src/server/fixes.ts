import { applyFix, invert } from "../checks/fixes.ts";
import type { OpenedProject } from "../schema/api.ts";
import type { ChatMessage } from "../schema/chat.ts";
import type { ValidationError } from "../schema/errors.ts";
import type { Fix, FixOffer } from "../schema/fixes.ts";
import { appendChat, readChat } from "./chat.ts";
import { laidOut } from "./graphs.ts";
import { projectDir, writeProjectFile } from "./projects.ts";
import { saveStoryboard } from "./storyboards.ts";

/**
 * A fix applied to a project's files (decision 038): new words are saved as
 * the Script gate saves them, so they must fit the script; new hand-placed
 * positions lay the graph out again. Refused, with nothing changed, when
 * what it changes is no longer as it was. The caller holds the project lock.
 */
export const fixProject = async (
  projectsDir: string,
  opened: OpenedProject,
  fix: Fix,
  now: Date,
): Promise<
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** Conflict: what it changes has changed since; invalid: the result would not fit. */
      readonly why: "conflict" | "invalid";
      readonly errors: readonly ValidationError[];
    }
> => {
  const invalid = (errors: readonly ValidationError[]) => ({
    ok: false as const,
    why: "invalid" as const,
    errors,
  });
  const { graph, storyboard, layout } = opened;
  if (!graph || !storyboard)
    return invalid([{ path: "storyboard.json", message: "missing; there is no script to fix" }]);
  const fixed = applyFix({ storyboard, overrides: layout?.overrides ?? {} }, fix);
  if (!fixed.ok) return { ok: false, why: "conflict", errors: fixed.errors };
  if (fixed.value.storyboard) {
    const saved = await saveStoryboard(projectsDir, opened, fixed.value.storyboard, now);
    if (!saved.ok) return invalid(saved.errors);
  }
  if (fixed.value.overrides) {
    const next = await laidOut(graph, {
      ...(layout ?? { version: 1, positions: {}, routes: {} }),
      overrides: fixed.value.overrides,
    });
    if (!next.ok) return invalid(next.errors);
    await writeProjectFile(projectsDir, opened.slug, "layout.json", next.value);
  }
  return { ok: true };
};

/** A fix the chat offered, and whether it is applied now, from the chat's own record. */
export const findFix = (
  messages: readonly ChatMessage[],
  id: string,
): { readonly offer: FixOffer; readonly applied: boolean } | undefined => {
  const offer = messages.flatMap((m) => m.fixes ?? []).find((f) => f.id === id);
  if (!offer) return undefined;
  const last = messages.findLast((m) => m.fix?.id === id);
  return { offer, applied: last?.fix?.done === "applied" };
};

/** What applying or undoing a fix from the chat came to; the API answers each with its status. */
export type FixOutcome =
  | { readonly kind: "done"; readonly message: ChatMessage }
  | { readonly kind: "no-fix" }
  | { readonly kind: "conflict" | "invalid"; readonly errors: readonly ValidationError[] };

/**
 * Applies a fix the chat offered, or undoes one it applied, by applying its
 * inverse, and says so in the chat. The caller holds the project lock.
 */
export const fixFromChat = async (
  projectsDir: string,
  opened: OpenedProject,
  {
    id,
    undo,
    gate,
  }: { readonly id: string; readonly undo: boolean; readonly gate: ChatMessage["gate"] },
  now: Date,
): Promise<FixOutcome> => {
  const dir = projectDir(projectsDir, opened.slug);
  const found = findFix((await readChat(dir)).messages, id);
  if (!found) return { kind: "no-fix" };
  const { offer, applied } = found;
  if (applied !== undo)
    return {
      kind: "conflict",
      errors: [
        {
          path: id,
          message: undo ? "is not applied, so there is nothing to undo" : "is applied already",
        },
      ],
    };
  const done = await fixProject(projectsDir, opened, undo ? invert(offer.fix) : offer.fix, now);
  if (!done.ok)
    return {
      kind: done.why,
      errors: done.errors,
    };
  const message: ChatMessage = {
    role: "assistant",
    kind: "fix",
    text: `${undo ? "Undid" : "Done"}: ${offer.label.charAt(0).toLowerCase()}${offer.label.slice(1)}.`,
    at: now.toISOString(),
    gate,
    fix: { id, done: undo ? "undone" : "applied" },
  };
  await appendChat(dir, [message]);
  return { kind: "done", message };
};
