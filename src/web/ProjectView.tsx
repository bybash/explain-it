import { useEffect, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import type { ValidationError } from "../schema/errors.ts";
import { GATES } from "../schema/project.ts";
import { onServerEvents, openProject } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { GATE_LABELS, updatedLabel } from "./labels.ts";

/**
 * An opened project: its name, the gate it is at, and which of its files
 * exist so far. The gate panels come in the next slices.
 */
export const ProjectView = ({ slug }: { slug: string }) => {
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
      event: (event) => {
        if (event.slug === slug) load();
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
      {opened && <Opened opened={opened} />}
    </section>
  );
};

const Opened = ({ opened }: { opened: OpenedProject }) => {
  const { project, graph, storyboard, layout, config, problems } = opened;
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
  const at = GATES.indexOf(project.gate);
  return (
    <>
      <h1 className="page-title">{project.name}</h1>
      <p className="muted">
        {opened.slug} · {project.origin === "mcp" ? "made over MCP" : "made in the app"} ·{" "}
        {updatedLabel(project.updatedAt)}
      </p>
      <ol className="gates" aria-label="Gates">
        {GATES.map((gate, i) => (
          <li
            key={gate}
            className="gate"
            data-state={i < at ? "done" : i === at ? "current" : "next"}
            aria-current={i === at ? "step" : undefined}
          >
            <span className="gate-number">{i + 1}</span> {GATE_LABELS[gate]}
          </li>
        ))}
      </ol>
      <h2 className="section-title">Files</h2>
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
