import { lazy, Suspense, useEffect, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import type { ValidationError } from "../schema/errors.ts";
import { type Gate, nextGate, type Project } from "../schema/project.ts";
import { approveGate, onServerEvents, openProject } from "./api.ts";
import { Chat } from "./Chat.tsx";
import { Errors } from "./Errors.tsx";
import { GATE_LABELS, GATE_PANELS, updatedLabel } from "./labels.ts";
import { gateSteps } from "./route.ts";

/** The graph editor, loaded with the graph gate: CodeMirror and Mermaid are large, and only it needs them. */
const GraphPanel = lazy(() => import("./GraphPanel.tsx").then((m) => ({ default: m.GraphPanel })));

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

  return (
    <section className="page">
      <a className="back" href="#/">
        ← All projects
      </a>
      {errors.length > 0 && (
        <>
          <h1 className="page-title">{slug}</h1>
          <p>This project could not be opened:</p>
          <Errors errors={errors} />
        </>
      )}
      {!opened && errors.length === 0 && <p className="muted">Opening…</p>}
      {opened && (
        <Opened
          opened={opened}
          requested={gate}
          approved={(project) => setOpened({ ...opened, project })}
        />
      )}
    </section>
  );
};

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
    <div className="workspace">
      <Chat key={slug} slug={slug} gate={viewed} />
      <div className="panel">
        <h1 className="page-title">{project.name}</h1>
        <p className="muted">
          {slug} · {project.origin === "mcp" ? "made over MCP" : "made in the app"} ·{" "}
          {updatedLabel(project.updatedAt)}
        </p>
        <ol className="gates" aria-label="Gates">
          {steps.map((step, i) => (
            <li key={step.gate}>
              {step.open ? (
                <a
                  className="gate"
                  href={`#/projects/${slug}/${step.gate}`}
                  data-state={step.state}
                  data-viewed={step.viewed}
                  aria-current={step.viewed ? "step" : undefined}
                >
                  <span className="gate-number">{i + 1}</span> {GATE_LABELS[step.gate]}
                </a>
              ) : (
                <span className="gate" data-state={step.state} aria-disabled="true">
                  <span className="gate-number">{i + 1}</span> {GATE_LABELS[step.gate]}
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
    <section className="gate-panel" aria-label={`${GATE_LABELS[gate]} gate`}>
      <h2 className="section-title">{GATE_LABELS[gate]}</h2>
      <p>{GATE_PANELS[gate]}</p>
      {gate === "graph" ? (
        <Suspense fallback={<p className="muted">Opening the graph editor…</p>}>
          <GraphPanel opened={opened} blocked={setBlocked} />
        </Suspense>
      ) : (
        <p className="muted">This gate's panel comes in a later version.</p>
      )}
      {gate === project.gate ? (
        next && (
          <div className="approve">
            <button type="button" onClick={approve} disabled={approving || blocked !== undefined}>
              Approve and go to {GATE_LABELS[next]}
            </button>
            {blocked && <span className="muted"> {blocked}</span>}
            <Errors errors={errors} />
          </div>
        )
      ) : (
        <p className="approved">
          Approved. The project is at the{" "}
          <a href={`#/projects/${slug}/${project.gate}`}>{GATE_LABELS[project.gate]}</a> gate.
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
    { file: "layout.json", summary: layout && `${Object.keys(layout.positions).length} positions` },
    { file: "config.json", summary: config && "style and output set" },
  ];
  return (
    <>
      <h3 className="section-title">Files</h3>
      {problems.length > 0 && (
        <>
          <p>Some files are broken:</p>
          <Errors errors={problems} />
        </>
      )}
      <ul className="files">
        {files.map(({ file, summary }) => (
          <li key={file} className="file" data-present={summary !== null}>
            <code>{file}</code>
            <span className="muted">
              {summary ??
                (problems.some((p) => p.path.startsWith(file)) ? "broken" : "not made yet")}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
};
