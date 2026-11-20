import { z } from "zod";
import { ConfigSchema } from "./config.ts";
import { GraphSchema } from "./graph.ts";
import { LayoutSchema } from "./layout.ts";
import { ProjectSchema } from "./project.ts";
import { StoryboardSchema } from "./storyboard.ts";

/** The projects API's requests and responses: the server sends these shapes and the web app checks them. */

/** A project's folder name, as the server makes it from the project's name. */
export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: "must be lower-case words joined by hyphens" });

export const ErrorsResponseSchema = z.object({
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
});

/** `POST /api/projects`: only the name; everything else starts at its default. */
export const NewProjectSchema = z.strictObject({ name: ProjectSchema.shape.name });

export const CreatedProjectSchema = z.object({ slug: SlugSchema, project: ProjectSchema });

export const ProjectSummarySchema = ProjectSchema.pick({
  name: true,
  gate: true,
  origin: true,
  updatedAt: true,
}).extend({ slug: SlugSchema });

/** `GET /api/projects`: the projects, newest first, and the folders whose project.json can't be read. */
export const ProjectListSchema = z.object({
  projects: z.array(ProjectSummarySchema),
  broken: z.array(z.object({ slug: SlugSchema, errors: ErrorsResponseSchema.shape.errors })),
});

/**
 * `GET /api/projects/:slug`: the project's files, each already checked by the
 * server (the storyboard and layout against the graph too); null when missing.
 */
export const OpenedProjectSchema = z.object({
  slug: SlugSchema,
  project: ProjectSchema,
  graph: GraphSchema.nullable(),
  storyboard: StoryboardSchema.nullable(),
  layout: LayoutSchema.nullable(),
  config: ConfigSchema.nullable(),
});

/** `GET /api/events`: what the server tells listeners about. Render progress joins in 3.9. */
export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project-created"), slug: SlugSchema }),
]);

export type ProjectSummary = z.output<typeof ProjectSummarySchema>;
export type ProjectList = z.output<typeof ProjectListSchema>;
export type OpenedProject = z.output<typeof OpenedProjectSchema>;
export type ServerEvent = z.output<typeof ServerEventSchema>;
