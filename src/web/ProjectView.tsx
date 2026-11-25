import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import type { ValidationError } from "../schema/errors.ts";
import { type Gate, nextGate, type Project } from "../schema/project.ts";
import { approveGate, onServerEvents, openProject } from "./api.ts";
import { Chat } from "./Chat.tsx";
import { Errors } from "./Errors.tsx";
import { GATE_LABELS, GATE_PANELS, updatedLabel } from "./labels.ts";
import { LAYOUT_LABELS } from "./layout.ts";
import { gateSteps } from "./route.ts";
import { ScriptGate } from "./ScriptGate.tsx";
import { BoxList, Muted, PageTitle } from "./ui.tsx";
import { useLayout } from "./useLayout.ts";

/** The graph editor, loaded with the graph gate: CodeMirror and Mermaid are large, and only it needs them. */
const GraphPanel = lazy(() => import("./GraphPanel.tsx").then((m) => ({ default: m.GraphPanel })));
/** The player, loaded with the preview gate. */
const PreviewPanel = lazy(() =>
  import("./PreviewPanel.tsx").then((m) => ({ default: m.PreviewPanel })),
);
/** The renders and their downloads, loaded with the render gate. */
const RenderPanel = lazy(() =>
  import("./RenderPanel.tsx").then((m) => ({ default: m.RenderPanel })),
);
/** The style form, loaded with the style gate: it carries the palettes and fonts. */
const StylePanel = lazy(() => import("./StylePanel.tsx").then((m) => ({ default: m.StylePanel })));

/**
 * An opened project (SPEC, User flow): its gates and Approve across the top,
 * then the chat and the panel of the gate viewed, side by side or either
 * one alone, as the user chooses.
 */
export const ProjectView = ({ slug, gate }: { slug: string; gate?: Gate | undefined }) => {
  const [opened, setOpened] = useState<OpenedProject | undefined>();
  const [errors, setErrors] = useState<readonly ValidationError[]>([]);

  useEffect(() => {
    let current = true;
    setOpened(undefined);
    setErrors([]);
    const load = () =>
      void openProject(slug).then((result) => {
        if (!current) return;
        if (result.ok) {
          setOpened(result.value);
          setErrors([]);
        } else setErrors(result.errors);
      });
    load();
    // An agent working over MCP changes the project while its user watches this page.
    const stop = onServerEvents({
      connected: load,
      // Chat messages change only the chat column, which listens for them itself.
      event: (event) => {
        if (event.slug === slug && event.type !== "chat") load();
      },
    });
    return () => {
      current = false;
      stop();
    };
  }, [slug]);

  // Until the project the address names has opened, the one before it is not shown: its gates
  // would be checked against the new address, and the address corrected back to it.
  const addressed = opened?.slug === slug ? opened : undefined;
  return (
    <section>
      {!addressed && (
        <a className="mb-4 inline-block text-muted" href="#/">
          ← All projects
        </a>
      )}
      {errors.length > 0 && (
        <>
          <PageTitle>{slug}</PageTitle>
          <p className="my-4">This project could not be opened:</p>
          <Errors errors={errors} />
        </>
      )}
      {!addressed && errors.length === 0 && <Muted>Opening…</Muted>}
      {addressed && (
        <Opened
          opened={addressed}
          requested={gate}
          approved={(project) => setOpened({ ...addressed, project })}
        />
      )}
    </section>
  );
};

/** A gate in the stepper: done, the one reached, or not reached yet. */
const GATE_PILL_CLASS =
  "rounded-full border border-line px-3 py-1.5 text-muted text-sm data-[state=current]:border-accent data-[state=current]:bg-accent-soft data-[state=current]:font-semibold data-[state=current]:text-accent data-[state=done]:text-ink";

const Opened = ({
  opened,
  requested,
  approved,
}: {
  opened: OpenedProject;
  requested: Gate | undefined;
  approved: (project: Project) => void;
}) => {
  const { slug, project } = opened;
  const steps = gateSteps(project.gate, requested);
  const viewed = steps.find((s) => s.viewed)?.gate ?? project.gate;
  // An address naming a gate not reached yet shows the gate reached, and then names it.
  useEffect(() => {
    if (requested !== undefined && requested !== viewed)
      location.replace(`#/projects/${slug}/${viewed}`);
  }, [requested, viewed, slug]);
  const { layout, choices, choose } = useLayout();
  /** Why a gate cannot be approved yet, as its panel says, and what approving it came to; said only at that gate. */
  const [blocked, setBlocked] = useState<{ gate: Gate; reason: string | undefined }>();
  const [failed, setFailed] = useState<{ gate: Gate; errors: readonly ValidationError[] }>();
  const [approving, setApproving] = useState(false);
  const reason = blocked?.gate === viewed ? blocked.reason : undefined;
  const block = useCallback(
    (why: string | undefined) => setBlocked({ gate: viewed, reason: why }),
    [viewed],
  );
  const next = nextGate(viewed);

  const approve = async () => {
    setApproving(true);
    const result = await approveGate(slug, viewed);
    setApproving(false);
    if (!result.ok) return setFailed({ gate: viewed, errors: result.errors });
    setFailed(undefined);
    // The approved project first, so the next gate is open before the address names it.
    approved(result.value.project);
    location.hash = `#/projects/${slug}/${result.value.project.gate}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a className="text-muted hover:text-ink" href="#/" aria-label="All projects">
          ←
        </a>
        <h1 className="font-bold text-lg">{project.name}</h1>
        <span className="text-muted text-sm">
          {slug} · {project.origin === "mcp" ? "made over MCP" : "made in the app"} ·{" "}
          {updatedLabel(project.updatedAt)}
        </span>
        <fieldset className="ml-auto flex rounded-box border border-line bg-surface p-0.5">
          <legend className="sr-only">Layout</legend>
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={choice === layout}
              className="rounded-[8px] px-3 py-1 text-muted text-sm hover:text-ink aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent"
              onClick={() => choose(choice)}
            >
              {LAYOUT_LABELS[choice]}
            </button>
          ))}
        </fieldset>
      </div>
      {/* Stays at the top as a long panel scrolls, so a gate can be approved from anywhere in it. */}
      <div className="sticky top-0 z-10 -mx-2 mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 bg-page px-2 py-3">
        <ol className="flex flex-wrap gap-2" aria-label="Gates">
          {steps.map((step, i) => (
            <li key={step.gate}>
              {step.open ? (
                <a
                  className={`${GATE_PILL_CLASS} inline-block hover:border-accent data-[viewed=true]:outline-2 data-[viewed=true]:outline-accent data-[viewed=true]:outline-offset-1`}
                  href={`#/projects/${slug}/${step.gate}`}
                  data-state={step.state}
                  data-viewed={step.viewed}
                  aria-current={step.viewed ? "step" : undefined}
                  // A gate asked for is there to be seen, beside the chat where there is room.
                  onClick={() => {
                    if (layout === "chat") choose(choices.includes("split") ? "split" : "panel");
                  }}
                >
                  <span className="tabular-nums">{i + 1}</span> {GATE_LABELS[step.gate]}
                </a>
              ) : (
                <span
                  className={`${GATE_PILL_CLASS} inline-block opacity-60`}
                  data-state={step.state}
                  aria-disabled="true"
                >
                  <span className="tabular-nums">{i + 1}</span> {GATE_LABELS[step.gate]}
                </span>
              )}
            </li>
          ))}
        </ol>
        {viewed === project.gate && next && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            {reason && <span className="text-muted text-sm">{reason}</span>}
            <button
              className="btn"
              type="button"
              onClick={approve}
              disabled={approving || reason !== undefined}
            >
              Approve and go to {GATE_LABELS[next]}
            </button>
          </div>
        )}
        <Errors className="w-full" errors={failed?.gate === viewed ? failed.errors : []} />
      </div>
      {/* Both stay in the page whatever the layout, so nothing typed in either is lost. */}
      <div
        className={`grid grid-cols-[minmax(0,1fr)] items-start gap-6 ${layout === "split" ? "min-[861px]:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]" : ""}`}
      >
        <Chat
          key={slug}
          slug={slug}
          gate={viewed}
          hidden={layout === "panel"}
          full={layout === "chat"}
        />
        <div hidden={layout === "chat"}>
          <GatePanel key={viewed} opened={opened} gate={viewed} blocked={block} />
        </div>
      </div>
    </div>
  );
};

/** A gate's panel: what it shows, and the files so far. `blocked` is told why it cannot be approved yet. */
const GatePanel = ({
  opened,
  gate,
  blocked,
}: {
  opened: OpenedProject;
  gate: Gate;
  blocked: (reason: string | undefined) => void;
}) => {
  const { slug, project } = opened;
  return (
    <section aria-label={`${GATE_LABELS[gate]} gate`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-bold text-lg">{GATE_LABELS[gate]}</h2>
        {gate !== project.gate && (
          <p className="text-muted text-sm">
            Approved. The project is at the{" "}
            <a className="underline" href={`#/projects/${slug}/${project.gate}`}>
              {GATE_LABELS[project.gate]}
            </a>{" "}
            gate.
          </p>
        )}
        <p className="w-full text-muted">{GATE_PANELS[gate]}</p>
      </div>
      {gate === "graph" ? (
        <Suspense fallback={<Muted>Opening the graph editor…</Muted>}>
          <GraphPanel opened={opened} blocked={blocked} />
        </Suspense>
      ) : gate === "preview" ? (
        <Suspense fallback={<Muted>Opening the preview…</Muted>}>
          <PreviewPanel opened={opened} />
        </Suspense>
      ) : gate === "render" ? (
        <Suspense fallback={<Muted>Opening the renders…</Muted>}>
          <RenderPanel opened={opened} />
        </Suspense>
      ) : gate === "style" ? (
        <Suspense fallback={<Muted>Opening the style…</Muted>}>
          <StylePanel opened={opened} blocked={blocked} />
        </Suspense>
      ) : (
        <ScriptGate opened={opened} blocked={blocked} />
      )}
      <Files opened={opened} />
    </section>
  );
};

const Files = ({ opened }: { opened: OpenedProject }) => {
  const { graph, storyboard, layout, config, problems } = opened;
  const files = [
    {
      file: "graph.json",
      summary: graph && `${graph.nodes.length} nodes, ${graph.edges.length} edges`,
    },
    {
      file: "storyboard.json",
      summary:
        storyboard &&
        `${storyboard.scenes.length} scenes, ${storyboard.scenes.flatMap((s) => s.beats).length} beats`,
    },
    { file: "brief.json", summary: opened.brief && "the story brief" },
    { file: "layout.json", summary: layout && `${Object.keys(layout.positions).length} positions` },
    { file: "config.json", summary: config && "style and output set" },
  ];
  return (
    // Open by itself only when something in it needs the user.
    <details className="mt-8" open={problems.length > 0}>
      <summary className="mb-3 cursor-pointer font-semibold text-muted text-sm">
        The project's files
      </summary>
      {problems.length > 0 && (
        <>
          <p className="my-4">Some files are broken:</p>
          <Errors errors={problems} />
        </>
      )}
      <BoxList>
        {files.map(({ file, summary }) => (
          <li key={file} className="flex justify-between gap-3 px-4 py-3">
            <code className={summary === null ? "text-muted" : undefined}>{file}</code>
            <span className="text-muted">
              {summary ??
                (problems.some((p) => p.path.startsWith(file)) ? "broken" : "not made yet")}
            </span>
          </li>
        ))}
      </BoxList>
    </details>
  );
};
