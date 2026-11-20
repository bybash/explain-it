import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inFile, readJson } from "../render/load.ts";
import {
  NewProjectSchema,
  type OpenedProject,
  type ProjectList,
  type ProjectSummary,
  SlugSchema,
} from "../schema/api.ts";
import { parseConfig } from "../schema/config.ts";
import type { Validated, ValidationError } from "../schema/errors.ts";
import { parseWith } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import { parseLayout } from "../schema/layout.ts";
import { type Project, parseProject } from "../schema/project.ts";
import { fail, ok } from "../schema/result.ts";
import { parseStoryboard } from "../schema/storyboard.ts";
import { slugify } from "./slug.ts";

/** A slug as `slugify` makes it; anything else names no project, so a path can't leave the folder. */
export const isSlug = (slug: string): boolean => SlugSchema.safeParse(slug).success;

const readProjectFile = async (dir: string): Promise<Validated<Project>> => {
  const file = await readJson(dir, "project.json");
  if (!file.ok) return fail([file.error]);
  const project = parseProject(file.data);
  return project.ok ? project : fail(inFile("project.json", project.errors));
};

const slugsIn = async (projectsDir: string): Promise<string[]> => {
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && isSlug(e.name)).map((e) => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};

/** Every project folder, the most recently updated first, and the folders that can't be read. */
export const listProjects = async (projectsDir: string): Promise<ProjectList> => {
  const slugs = (await slugsIn(projectsDir)).sort();
  const read = await Promise.all(
    slugs.map(async (slug) => ({ slug, project: await readProjectFile(join(projectsDir, slug)) })),
  );
  const projects: ProjectSummary[] = [];
  const broken: ProjectList["broken"] = [];
  for (const { slug, project } of read)
    if (project.ok) {
      const { name, gate, origin, updatedAt } = project.value;
      projects.push({ slug, name, gate, origin, updatedAt });
    } else broken.push({ slug, errors: [...project.errors] });
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug));
  return { projects, broken };
};

/** Makes a project folder with its `project.json`, at the graph gate, named by a slug of its name. */
export const createProject = async (
  projectsDir: string,
  input: unknown,
  now: Date,
): Promise<Validated<{ slug: string; project: Project }>> => {
  const parsed = parseWith(NewProjectSchema, input);
  if (!parsed.ok) return parsed;
  await mkdir(projectsDir, { recursive: true });
  const at = now.toISOString();
  const project: Project = {
    version: 1,
    name: parsed.value.name,
    gate: "graph",
    staleBeats: [],
    origin: "web",
    createdAt: at,
    updatedAt: at,
  };
  // Another request may take the same slug between listing and creating; then try the next one.
  for (;;) {
    const slug = slugify(project.name, await slugsIn(projectsDir));
    try {
      await mkdir(join(projectsDir, slug));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    await writeFile(
      join(projectsDir, slug, "project.json"),
      `${JSON.stringify(project, null, 2)}\n`,
    );
    return ok({ slug, project });
  }
};

/**
 * A project's files, each through its schema. Missing files are null; the
 * storyboard and layout are checked against the graph. Undefined when there
 * is no such project.
 */
export const openProject = async (
  projectsDir: string,
  slug: string,
): Promise<Validated<OpenedProject> | undefined> => {
  if (!isSlug(slug) || !(await slugsIn(projectsDir)).includes(slug)) return undefined;
  const dir = join(projectsDir, slug);
  const project = await readProjectFile(dir);
  if (!project.ok) return project;

  const errors: ValidationError[] = [];
  /** A file through `parse`, null when missing; its errors are kept, named by file. */
  const optional = async <T>(
    file: string,
    parse: (data: unknown) => Validated<T>,
  ): Promise<T | null> => {
    const read = await readJson(dir, file);
    if (!read.ok) {
      if (!read.missing) errors.push(read.error);
      return null;
    }
    const parsed = parse(read.data);
    if (parsed.ok) return parsed.value;
    errors.push(...inFile(file, parsed.errors));
    return null;
  };

  const graph = await optional("graph.json", parseGraph);
  const config = await optional("config.json", parseConfig);
  // The storyboard and layout refer to the graph, so they can only be checked once it is valid.
  const storyboard = graph
    ? await optional("storyboard.json", (data) => parseStoryboard(data, graph))
    : null;
  const layout = graph ? await optional("layout.json", (data) => parseLayout(data, graph)) : null;
  if (errors.length > 0) return fail(errors);
  return ok({ slug, project: project.value, graph, storyboard, layout, config });
};
