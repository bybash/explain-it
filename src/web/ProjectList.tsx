import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { ProjectList as List } from "../schema/api.ts";
import type { ValidationError } from "../schema/errors.ts";
import { createProject, listProjects, onServerEvents } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { GATE_LABELS, updatedLabel } from "./labels.ts";
import { BoxList, Muted, PageTitle } from "./ui.tsx";

/** The projects, newest first, with a form to start a new one. */
export const ProjectList = () => {
  const [list, setList] = useState<List | undefined>();
  const [loadErrors, setLoadErrors] = useState<readonly ValidationError[]>([]);
  const [name, setName] = useState("");
  const [formErrors, setFormErrors] = useState<readonly ValidationError[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const result = await listProjects();
    if (result.ok) {
      setList(result.value);
      setLoadErrors([]);
    } else setLoadErrors(result.errors);
  }, []);

  // A project created elsewhere, in another tab or later over MCP, shows up here too. Each
  // (re)connection reloads the list, so nothing made while the stream was down is missed.
  useEffect(() => {
    void load();
    return onServerEvents({ connected: () => void load(), event: () => void load() });
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    const result = await createProject(name.trim());
    setCreating(false);
    if (!result.ok) return setFormErrors(result.errors);
    setFormErrors([]);
    setName("");
    location.hash = `#/projects/${result.value.slug}`;
  };

  return (
    <section>
      <PageTitle>Projects</PageTitle>
      <form className="mt-6 mb-8" onSubmit={create}>
        <label className="mb-2 block font-semibold" htmlFor="new-project-name">
          New project
        </label>
        <div className="flex gap-2">
          <input
            className="field min-w-0 flex-1 bg-surface"
            id="new-project-name"
            value={name}
            placeholder="What does the video explain? For example: OAuth login"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={formErrors.length > 0}
            aria-describedby="new-project-errors"
          />
          <button className="btn" type="submit" disabled={creating || name.trim() === ""}>
            Create
          </button>
        </div>
        <Errors id="new-project-errors" errors={formErrors} />
      </form>

      <Errors errors={loadErrors} />
      {list === undefined ? (
        loadErrors.length === 0 && <Muted>Loading…</Muted>
      ) : list.projects.length === 0 ? (
        <Muted>No projects yet. Name one above to start.</Muted>
      ) : (
        <BoxList label="Projects">
          {list.projects.map((project) => (
            <li key={project.slug}>
              <a
                className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3.5 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                href={`#/projects/${project.slug}`}
              >
                <span className="font-semibold">{project.name}</span>
                <span
                  className="self-start rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent text-xs"
                  data-gate={project.gate}
                >
                  {GATE_LABELS[project.gate]}
                </span>
                <span className="col-span-full text-muted text-sm">
                  {updatedLabel(project.updatedAt)}
                </span>
              </a>
            </li>
          ))}
        </BoxList>
      )}

      {list && list.broken.length > 0 && (
        <details className="mt-6 text-muted">
          <summary>
            {list.broken.length} {list.broken.length === 1 ? "folder" : "folders"} in projects/
            could not be read
          </summary>
          <ul className="my-4 list-disc pl-10">
            {list.broken.map((broken) => (
              <li key={broken.slug}>
                <code>{broken.slug}</code>
                <Errors errors={broken.errors} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};
