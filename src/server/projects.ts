import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inFile, readJson } from "../render/load.ts";
import {
  NewProjectSchema,
  type OpenedProject,
  type ProjectList,
  type ProjectSummary,
  ProjectSummarySchema,
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

/** What is in the projects folder: every name, and the project folders among them. */
const entriesIn = async (projectsDir: string) => {
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    return {
      // A file can block a slug as well as a folder can.
      taken: entries.map((e) => e.name),
      folders: entries.filter((e) => e.isDirectory() && isSlug(e.name)).map((e) => e.name),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { taken: [], folders: [] };
    throw error;
  }
};

const isEmpty = async (dir: string) => (await readdir(dir)).length === 0;

/**
 * Every project folder, the most recently updated first, and the folders
 * that can't be read. An empty folder is no project yet: one being made, or
 * one a crash left behind.
 */
export const listProjects = async (projectsDir: string): Promise<ProjectList> => {
  const slugs = (await entriesIn(projectsDir)).folders.sort();
  const read = await Promise.all(
    slugs.map(async (slug) => {
      const dir = join(projectsDir, slug);
      return { slug, empty: await isEmpty(dir), project: await readProjectFile(dir) };
    }),
  );
  const projects: ProjectSummary[] = [];
  const broken: ProjectList["broken"] = [];
  for (const { slug, empty, project } of read)
    if (project.ok) projects.push(ProjectSummarySchema.parse({ ...project.value, slug }));
    else if (!empty) broken.push({ slug, errors: [...project.errors] });
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
    const slug = slugify(project.name, (await entriesIn(projectsDir)).taken);
    try {
      await mkdir(join(projectsDir, slug));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    await writeJsonAtomically(join(projectsDir, slug, "project.json"), project);
    return ok({ slug, project });
  }
};

/** Writes JSON to a file by renaming a finished temporary file over it, so no reader sees half of it. */
const writeJsonAtomically = async (file: string, data: unknown) => {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temporary, file);
};

/**
 * A project's files, each through its schema. A missing or broken file is
 * null, and `problems` names what is wrong with the broken ones; the
 * storyboard and layout are checked against the graph. Fails only when
 * project.json itself is broken, and is undefined when there is no such
 * project, which the API answers with 404.
 */
export const openProject = async (
  projectsDir: string,
  slug: string,
): Promise<Validated<OpenedProject> | undefined> => {
  if (!isSlug(slug) || !(await entriesIn(projectsDir)).folders.includes(slug)) return undefined;
  const dir = join(projectsDir, slug);
  const project = await readProjectFile(dir);
  if (!project.ok) return project;

  const problems: ValidationError[] = [];
  /** A file through `parse`, null when missing; its errors are kept, named by file. */
  const optional = async <T>(
    file: string,
    parse: (data: unknown) => Validated<T>,
  ): Promise<T | null> => {
    const read = await readJson(dir, file);
    if (!read.ok) {
      if (!read.missing) problems.push(read.error);
      return null;
    }
    const parsed = parse(read.data);
    if (parsed.ok) return parsed.value;
    problems.push(...inFile(file, parsed.errors));
    return null;
  };

  const graph = await optional("graph.json", parseGraph);
  const config = await optional("config.json", parseConfig);
  // The storyboard and layout refer to the graph, so they can only be checked once it is valid.
  const storyboard = graph
    ? await optional("storyboard.json", (data) => parseStoryboard(data, graph))
    : null;
  const layout = graph ? await optional("layout.json", (data) => parseLayout(data, graph)) : null;
  return ok({ slug, project: project.value, graph, storyboard, layout, config, problems });
};
