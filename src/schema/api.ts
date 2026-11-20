import { z } from "zod";
import { SlugSchema } from "./common.ts";
import { ConfigSchema } from "./config.ts";
import { ValidationErrorSchema } from "./errors.ts";
import { GraphSchema } from "./graph.ts";
import { LayoutSchema } from "./layout.ts";
import { ProjectSchema } from "./project.ts";
import { RenderEventSchema } from "./render.ts";
import { StoryboardSchema } from "./storyboard.ts";

/** The projects API's requests and responses: the server sends these shapes and the web app checks them. */

/** Every error response: what is wrong, each naming its place. */
export const ErrorsResponseSchema = z.object({ errors: z.array(ValidationErrorSchema) });

/** `POST /api/projects`: only the name; everything else starts at its default. */
export const NewProjectSchema = z.strictObject({ name: ProjectSchema.shape.name });

export const CreatedProjectSchema = z.object({ slug: SlugSchema, project: ProjectSchema });

/** What the list shows of a project. Not strict, so it takes a whole project and keeps only these. */
export const ProjectSummarySchema = z.object({
  ...ProjectSchema.pick({ name: true, gate: true, origin: true, updatedAt: true }).shape,
  slug: SlugSchema,
});

/** `GET /api/projects`: the projects, newest first, and the folders whose project.json can't be read. */
export const ProjectListSchema = z.object({
  projects: z.array(ProjectSummarySchema),
  broken: z.array(z.object({ slug: SlugSchema, errors: z.array(ValidationErrorSchema) })),
});

/**
 * `GET /api/projects/:slug`: the project's files, each already checked by the
 * server (the storyboard and layout against the graph too). A file is null
 * when it is missing or broken; `problems` names what is wrong with the
 * broken ones, so one bad file does not hide the rest of the project.
 */
export const OpenedProjectSchema = z.object({
  slug: SlugSchema,
  project: ProjectSchema,
  graph: GraphSchema.nullable(),
  storyboard: StoryboardSchema.nullable(),
  layout: LayoutSchema.nullable(),
  config: ConfigSchema.nullable(),
  problems: z.array(ValidationErrorSchema),
});

/** `GET /api/events`: what the server tells listeners about, including each render job's changes. */
export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project-created"), slug: SlugSchema }),
  z.object({ type: z.literal("project-updated"), slug: SlugSchema }),
  RenderEventSchema,
]);

export type ProjectSummary = z.output<typeof ProjectSummarySchema>;
export type ProjectList = z.output<typeof ProjectListSchema>;
export type OpenedProject = z.output<typeof OpenedProjectSchema>;
export type ServerEvent = z.output<typeof ServerEventSchema>;
