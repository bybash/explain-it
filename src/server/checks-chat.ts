import type { TtsProvider } from "../audio/tts.ts";
import { narrationLengths, readCachedVoice } from "../audio/voice.ts";
import { type ChatProblem, problemKey, sayProblem, wordProblems } from "../checks/chat-report.ts";
import { describeFix, fixesFor } from "../checks/fixes.ts";
import { projectBeats } from "../engine/beats/build.ts";
import type { LlmClient } from "../llm/client.ts";
import { shorterWords } from "../llm/words.ts";
import type { OpenedProject } from "../schema/api.ts";
import type { ChatMessage } from "../schema/chat.ts";
import type { BeatWarning, CheckReport } from "../schema/checks.ts";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import { type FixOffer, isAutomatic } from "../schema/fixes.ts";
import { appendChat } from "./chat.ts";
import type { Events } from "./events.ts";
import { fixFromChat } from "./fixes.ts";
import { openProject, projectDir, withProjectLock } from "./projects.ts";

/** How long the script rests after a change before the quick checks run, so typing is not checked at each save. */
const WAIT_MS = 1500;

/** The checks that the quick run makes: what the full run finds of these, it leaves to it. */
const QUICK_CHECKS: readonly string[] = ["reading-speed", "narration-fit"];

type Scope = "quick" | "full";

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
 * shorter words the LLM proposes are offered, and a layout fix is applied
 * and said, with Undo. What was reported is kept in memory, so a restart
 * may report a problem once more.
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
  /** The problems each scope found last time, by project: what has been reported, and is still there. */
  const known: Record<Scope, Map<string, ReadonlySet<string>>> = {
    quick: new Map(),
    full: new Map(),
  };
  const working = new Set<string>();
  const waiting = new Set<string>();
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
    const layout = problems.flatMap((p) =>
      p.kind === "warning" && "beat" in p.warning
        ? [p as ChatProblem & { warning: BeatWarning }]
        : [],
    );
    for (const fix of fixesFor(
      layout.map((p) => p.warning),
      opened.layout?.overrides ?? {},
    )) {
      const offer = { id: id(), label: describeFix(fix), fix };
      for (const p of layout)
        if (p.warning.nodes?.some((node) => node in (fix.before as object))) offers.set(p, offer);
    }
    return offers;
  };

  /** Posts the problems not reported yet, then applies the fixes that need no asking. */
  const report = async (slug: string, scope: Scope, problems: readonly ChatProblem[]) => {
    const reported = new Set([...(known.quick.get(slug) ?? []), ...(known.full.get(slug) ?? [])]);
    known[scope].set(slug, new Set(problems.map(problemKey)));
    const fresh = problems.filter((p) => !reported.has(problemKey(p)));
    if (fresh.length === 0) return;
    const opened = await openProject(projectsDir, slug);
    if (!opened?.ok) return;
    const at = now().toISOString();
    const offers = await offersFor(opened.value, fresh, at);
    const fixes = [...new Set(offers.values())];
    const found = fresh.map((p) => {
      const beat = p.kind === "words" ? p.beat : "beat" in p.warning ? p.warning.beat : undefined;
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
    events.publish({ type: "chat", slug });
    for (const offer of fixes.filter((f) => isAutomatic(f.fix))) {
      const done = await withProjectLock(projectsDir, slug, async () => {
        const now_ = await openProject(projectsDir, slug);
        if (!now_?.ok) return undefined;
        return fixFromChat(
          projectsDir,
          now_.value,
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
      if (problems) await report(slug, "quick", problems);
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

  events.subscribe((event) => {
    if (event.type === "project-updated") later(event.slug);
  });

  return {
    quick,
    /** The full checks' report, as written: the quick checks run with it, so all of it is said at once. */
    full: (slug: string, written: Pick<CheckReport, "warnings">) =>
      queue(slug, async () => {
        const problems = (await quickProblems(slug)) ?? [];
        const others = written.warnings
          .filter((w) => !QUICK_CHECKS.includes(w.check))
          .map((warning): ChatProblem => ({ kind: "warning", warning }));
        await report(slug, "quick", problems);
        await report(slug, "full", others);
      }),
    /** The assistant started a turn on the project: changes wait for it. */
    busy: (slug: string) => void working.add(slug),
    /** The assistant's turn ended: what it changed is checked now. */
    idle: (slug: string) => {
      working.delete(slug);
      if (waiting.delete(slug)) later(slug);
    },
    /** Resolves once the checks asked for so far have run; for tests. */
    settled: async (slug: string) => {
      while (timers.has(slug)) await new Promise((r) => setTimeout(r, 1));
      await runs.get(slug);
    },
  };
};

export type ChecksChat = ReturnType<typeof checksChat>;
