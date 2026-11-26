import type { TtsProvider } from "../audio/tts.ts";
import { narrationLengths, readCachedVoice } from "../audio/voice.ts";
import {
  beatOf,
  type ChatProblem,
  problemKey,
  sayProblem,
  wordProblems,
} from "../checks/chat-report.ts";
import { canonical, describeFix, fixesFor } from "../checks/fixes.ts";
import { projectBeats } from "../engine/beats/build.ts";
import type { LlmClient } from "../llm/client.ts";
import { repairLayout } from "../llm/drafting.ts";
import { shorterWords } from "../llm/words.ts";
import type { OpenedProject } from "../schema/api.ts";
import type { ChatMessage } from "../schema/chat.ts";
import { type CheckReport, QUICK_CHECKS } from "../schema/checks.ts";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import { type FixOffer, isAutomatic } from "../schema/fixes.ts";
import { appendChat } from "./chat.ts";
import type { Events } from "./events.ts";
import { fixFromChat } from "./fixes.ts";
import { openProject, projectDir, withProjectLock } from "./projects.ts";

/** How long the script rests after a change before the quick checks run, so typing is not checked at each save. */
const WAIT_MS = 1500;

/** The scene a beat is in, and the video, for words that keep their terms. */
const aboutBeat = (opened: OpenedProject, beat: string) => {
  const scene = opened.storyboard?.scenes.find((s) => s.beats.some((b) => b.id === beat));
  return `the scene "${scene?.title ?? ""}" of the video "${opened.graph?.title ?? opened.slug}"`;
};

/**
 * The checks in the chat (SPEC, LLM: checks become fixes; decision 038).
 * The quick checks run once the script rests after a change, and not while
 * the assistant works on it; the full checks' report is posted as it is
 * written. Only problems not reported yet are posted, each in plain words:
 * shorter words the LLM proposes are offered, a layout fix for a node put
 * by hand is applied and said, with Undo, and what that does not cover is
 * repaired by the LLM with labels and scenes, offered (5.6). What was reported is kept in memory, so a restart
 * may report a problem once more. While the assistant works, its changes,
 * and a report written meanwhile, wait for its turn to end.
 */
export const checksChat = ({
  projectsDir,
  tts,
  llm,
  events,
  now,
  wait = WAIT_MS,
}: {
  readonly projectsDir: string;
  readonly tts: TtsProvider;
  readonly llm: LlmClient;
  readonly events: Events;
  readonly now: () => Date;
  readonly wait?: number;
}) => {
  /**
   * The problems reported for each project, kept while the server runs: one
   * that goes away and comes back (a fix undone, say) is not said again, as
   * its message is still in the chat, with its fix.
   */
  const reported = new Map<string, Set<string>>();
  const working = new Set<string>();
  const waiting = new Set<string>();
  /** The full checks' report written while the assistant worked, said once it is done. */
  const held = new Map<string, Pick<CheckReport, "warnings">>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** The last run asked for each project: runs follow each other, so each sees what the last reported. */
  const runs = new Map<string, Promise<void>>();
  /** Fixes offered by this server so far: with the time, it makes each fix's id its own in the chat. */
  let fixCount = 0;

  const queue = (slug: string, run: () => Promise<void>) => {
    const next = (runs.get(slug) ?? Promise.resolve()).then(run).catch((error: unknown) => {
      console.error(`the checks in the chat failed on "${slug}":`, error);
    });
    runs.set(slug, next);
    return next;
  };

  /** Offers a fix for each new problem it can: shorter words from the LLM, a layout fix from the code. */
  const offersFor = async (opened: OpenedProject, problems: readonly ChatProblem[], at: string) => {
    const id = () => `fix-${Date.parse(at).toString(36)}-${(fixCount++).toString(36)}`;
    const offers = new Map<ChatProblem, FixOffer>();
    for (const problem of problems) {
      if (problem.kind !== "words") continue;
      const words = await shorterWords(llm, problem, aboutBeat(opened, problem.beat));
      if (!words.ok) continue;
      const fix = {
        kind: "words" as const,
        beat: problem.beat,
        field: problem.field,
        before: problem.text,
        after: words.value,
      };
      offers.set(problem, { id: id(), label: describeFix(fix), fix });
    }
    const layout = problems.flatMap((problem) =>
      problem.kind === "warning" && "beat" in problem.warning
        ? [{ problem, warning: problem.warning }]
        : [],
    );
    for (const fix of fixesFor(
      layout.map((p) => p.warning),
      opened.layout?.overrides ?? {},
    )) {
      if (fix.kind !== "layout") continue;
      const offer = { id: id(), label: describeFix(fix), fix };
      for (const { problem, warning } of layout)
        if (warning.nodes?.some((node) => node in fix.before)) offers.set(problem, offer);
    }
    // What laying hand-placed nodes out again does not cover goes to the LLM: labels and scenes (5.6).
    const left = layout.filter(
      ({ problem, warning }) =>
        !offers.has(problem) && (warning.check === "overlap" || warning.check === "off-frame"),
    );
    const { graph, storyboard } = opened;
    if (left.length > 0 && graph && storyboard) {
      const repair = await repairLayout(llm, {
        graph,
        storyboard,
        problems: left.map(({ problem }) => sayProblem(problem)),
      });
      if (repair.ok) {
        const scenesChanged = canonical(repair.value.storyboard) !== canonical(storyboard);
        const fix = {
          kind: "rewrite" as const,
          before: { graph, ...(scenesChanged ? { storyboard } : {}) },
          after: {
            graph: repair.value.graph,
            ...(scenesChanged ? { storyboard: repair.value.storyboard } : {}),
          },
        };
        const offer = { id: id(), label: repair.value.summary, fix };
        for (const { problem } of left) offers.set(problem, offer);
      }
    }
    return offers;
  };

  /**
   * Posts the problems not reported yet, then applies the fixes that need no
   * asking. A problem counts as reported once its message is in the chat.
   */
  const report = async (slug: string, problems: readonly ChatProblem[]) => {
    const said = reported.get(slug) ?? new Set();
    const fresh = problems.filter((p) => !said.has(problemKey(p)));
    if (fresh.length === 0) return;
    const opened = await openProject(projectsDir, slug);
    if (!opened?.ok) return;
    const at = now().toISOString();
    const offers = await offersFor(opened.value, fresh, at);
    const fixes = [...new Set(offers.values())];
    const found = fresh.map((p) => {
      const beat = beatOf(p);
      const fix = offers.get(p)?.id;
      return {
        key: problemKey(p),
        text: sayProblem(p),
        ...(beat ? { beat } : {}),
        ...(fix ? { fix } : {}),
      };
    });
    const message: ChatMessage = {
      role: "assistant",
      kind: "checks",
      text: [
        fresh.length === 1
          ? "The checks found a problem:"
          : `The checks found ${fresh.length} problems:`,
        ...found.map((f) => `- ${f.text}`),
      ].join("\n"),
      at,
      gate: opened.value.project.gate,
      found,
      ...(fixes.length ? { fixes } : {}),
    };
    await withProjectLock(projectsDir, slug, () =>
      appendChat(projectDir(projectsDir, slug), [message]),
    );
    reported.set(slug, new Set([...said, ...found.map((f) => f.key)]));
    events.publish({ type: "chat", slug });
    for (const offer of fixes.filter((f) => isAutomatic(f.fix))) {
      const done = await withProjectLock(projectsDir, slug, async () => {
        const current = await openProject(projectsDir, slug);
        if (!current?.ok) return undefined;
        return fixFromChat(
          projectsDir,
          current.value,
          { id: offer.id, undo: false, gate: message.gate },
          now(),
        );
      });
      if (done?.kind !== "done") continue;
      events.publish({ type: "project-updated", slug });
      events.publish({ type: "chat", slug });
    }
  };

  /** The quick checks' problems with the project as it is: words read too fast, or too long to say. */
  const quickProblems = async (slug: string): Promise<ChatProblem[] | undefined> => {
    const opened = await openProject(projectsDir, slug);
    if (!opened?.ok) return undefined;
    const { storyboard, graph } = opened.value;
    if (!storyboard || !graph) return undefined;
    const config = opened.value.config ?? DEFAULT_CONFIG;
    // Lines already spoken are timed by their voice, as the full checks time them; the rest by their words.
    const lines = await readCachedVoice({
      projectDir: projectDir(projectsDir, slug),
      storyboard,
      voice: config.voice,
      tts,
    });
    const narration = narrationLengths(lines);
    return wordProblems(
      projectBeats({ storyboard, graph, config, narration }),
      storyboard,
      narration,
    );
  };

  const quick = (slug: string) =>
    queue(slug, async () => {
      const problems = await quickProblems(slug);
      if (problems) await report(slug, problems);
    });

  /** Checks once the script rests, unless the assistant is at work: then once it is done. */
  const later = (slug: string) => {
    if (working.has(slug)) return void waiting.add(slug);
    clearTimeout(timers.get(slug));
    timers.set(
      slug,
      setTimeout(() => {
        timers.delete(slug);
        void quick(slug);
      }, wait),
    );
  };

  /** The full checks' report, as written: the quick checks run with it, so all of it is said at once. */
  const full = (slug: string, written: Pick<CheckReport, "warnings">): Promise<void> => {
    if (working.has(slug)) {
      held.set(slug, written);
      return Promise.resolve();
    }
    return queue(slug, async () => {
      const quickOnes = (await quickProblems(slug)) ?? [];
      const others = written.warnings
        .filter((w) => !(QUICK_CHECKS as readonly string[]).includes(w.check))
        .map((warning): ChatProblem => ({ kind: "warning", warning }));
      await report(slug, [...quickOnes, ...others]);
    });
  };

  events.subscribe((event) => {
    if (event.type === "project-updated") later(event.slug);
  });

  return {
    quick,
    /** The full checks' report, as written: the quick checks run with it, so all of it is said at once. */
    full,
    /** The assistant started a turn on the project: changes, and a report written meanwhile, wait for it. */
    busy: (slug: string) => {
      working.add(slug);
      const timer = timers.get(slug);
      if (timer === undefined) return;
      clearTimeout(timer);
      timers.delete(slug);
      waiting.add(slug);
    },
    /** The assistant's turn ended: what it changed is checked now. */
    idle: (slug: string) => {
      working.delete(slug);
      const written = held.get(slug);
      held.delete(slug);
      // A held report runs the quick checks too.
      if (written) void full(slug, written);
      else if (waiting.has(slug)) later(slug);
      waiting.delete(slug);
    },
    /** Resolves once the checks asked for so far have run; for tests. */
    settled: async (slug: string) => {
      while (timers.has(slug)) await new Promise((r) => setTimeout(r, 1));
      await runs.get(slug);
    },
  };
};

export type ChecksChat = ReturnType<typeof checksChat>;
