import { lazy, Suspense, useEffect, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import type { ValidationError } from "../schema/errors.ts";
import { type Gate, nextGate, type Project } from "../schema/project.ts";
import { approveGate, onServerEvents, openProject } from "./api.ts";
import { BriefPanel } from "./BriefPanel.tsx";
import { Chat } from "./Chat.tsx";
import { Errors } from "./Errors.tsx";
import { GATE_LABELS, GATE_PANELS, updatedLabel } from "./labels.ts";
import { gateSteps } from "./route.ts";
import { BoxList, Muted, PageTitle, SectionTitle } from "./ui.tsx";

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
 * An opened project: the chat on the left and, on the right, the gate
 * stepper and the panel of the gate viewed (SPEC, User flow). The gates'
 * own panels come in the next slices; until then a panel says what it will
 * show, lists the project's files and approves the gate.
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
      <a className="mb-4 inline-block text-muted" href="#/">
        ← All projects
      </a>
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
  return (
    <div className="grid grid-cols-[1fr] items-start gap-6 min-[861px]:grid-cols-[minmax(280px,380px)_1fr]">
      <Chat key={slug} slug={slug} gate={viewed} />
      <div>
        <PageTitle>{project.name}</PageTitle>
        <Muted>
          {slug} · {project.origin === "mcp" ? "made over MCP" : "made in the app"} ·{" "}
          {updatedLabel(project.updatedAt)}
        </Muted>
        <ol className="mt-6 flex flex-wrap gap-2" aria-label="Gates">
          {steps.map((step, i) => (
            <li key={step.gate}>
              {step.open ? (
                <a
                  className={`${GATE_PILL_CLASS} inline-block hover:border-accent data-[viewed=true]:outline-2 data-[viewed=true]:outline-accent data-[viewed=true]:outline-offset-1`}
                  href={`#/projects/${slug}/${step.gate}`}
                  data-state={step.state}
                  data-viewed={step.viewed}
                  aria-current={step.viewed ? "step" : undefined}
                >
                  <span className="tabular-nums">{i + 1}</span> {GATE_LABELS[step.gate]}
                </a>
              ) : (
                <span
                  className={`${GATE_PILL_CLASS} opacity-60`}
                  data-state={step.state}
                  aria-disabled="true"
                >
                  <span className="tabular-nums">{i + 1}</span> {GATE_LABELS[step.gate]}
                </span>
              )}
            </li>
          ))}
        </ol>
        {/* Keyed by gate, so an error shown at one gate is gone at the next. */}
        <GatePanel key={viewed} opened={opened} gate={viewed} approved={approved} />
      </div>
    </div>
  );
};

/** A gate's panel: what it shows, the files so far, and Approve at the gate reached. */
const GatePanel = ({
  opened,
  gate,
  approved,
}: {
  opened: OpenedProject;
  gate: Gate;
  approved: (project: Project) => void;
}) => {
  const { slug, project } = opened;
  const [errors, setErrors] = useState<readonly ValidationError[]>([]);
  const [approving, setApproving] = useState(false);
  /** Why the gate cannot be approved yet, as its panel says: unsaved edits. */
  const [blocked, setBlocked] = useState<string | undefined>();
  const next = nextGate(gate);

  const approve = async () => {
    setApproving(true);
    const result = await approveGate(slug, gate);
    setApproving(false);
    if (!result.ok) return setErrors(result.errors);
    setErrors([]);
    // The approved project first, so the next gate is open before the address names it.
    approved(result.value.project);
    location.hash = `#/projects/${slug}/${result.value.project.gate}`;
  };

  return (
    <section className="mt-2" aria-label={`${GATE_LABELS[gate]} gate`}>
      <SectionTitle level={2}>{GATE_LABELS[gate]}</SectionTitle>
      <p className="my-4">{GATE_PANELS[gate]}</p>
      {gate === "graph" ? (
        <Suspense fallback={<Muted>Opening the graph editor…</Muted>}>
          <GraphPanel opened={opened} blocked={setBlocked} />
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
          <StylePanel opened={opened} blocked={setBlocked} />
        </Suspense>
      ) : gate === "script" ? (
        <>
          <BriefPanel opened={opened} blocked={setBlocked} />
          <Muted>The scene and beat editor comes in a later version.</Muted>
        </>
      ) : (
        <Muted>This gate's panel comes in a later version.</Muted>
      )}
      {gate === project.gate ? (
        next && (
          <div className="my-4">
            <button
              className="btn"
              type="button"
              onClick={approve}
              disabled={approving || blocked !== undefined}
            >
              Approve and go to {GATE_LABELS[next]}
            </button>
            {blocked && <span className="text-muted"> {blocked}</span>}
            <Errors errors={errors} />
          </div>
        )
      ) : (
        <p className="my-4">
          Approved. The project is at the{" "}
          <a className="underline" href={`#/projects/${slug}/${project.gate}`}>
            {GATE_LABELS[project.gate]}
          </a>{" "}
          gate.
        </p>
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
    <>
      <SectionTitle level={3}>Files</SectionTitle>
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
    </>
  );
};
