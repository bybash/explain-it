import type { OpenedProject } from "../schema/api.ts";
import { Errors } from "./Errors.tsx";
import { BoxList } from "./ui.tsx";

/** The project's files and what each holds, folded away unless one is broken. */
export const ProjectFiles = ({ opened }: { opened: OpenedProject }) => {
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
    { file: "card.json", summary: opened.card && "the TL;DR card" },
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
