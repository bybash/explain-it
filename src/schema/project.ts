import { z } from "zod";
import { IdSchema, SchemaKeySchema } from "./common.ts";
import { parseWith, type Validated } from "./errors.ts";

export const GATES = ["graph", "script", "style", "preview", "render"] as const;
export const ORIGINS = ["web", "mcp"] as const;
export const MAX_PROJECT_NAME = 80;
/** The most source files one video records. */
export const MAX_SOURCES = 100;

export const SourceSchema = z.strictObject({
  path: z.string().min(1).max(300).describe("A file path in the explained repository."),
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/, { error: "must be a Git commit SHA" })
    .optional(),
});

export const ProjectSchema = z
  .strictObject({
    $schema: SchemaKeySchema,
    version: z.literal(1),
    name: z.string().min(1).max(MAX_PROJECT_NAME),
    gate: z.enum(GATES).describe("The gate the project is at."),
    staleBeats: z.array(IdSchema).describe("Beats that reference changed graph elements."),
    origin: z.enum(ORIGINS).describe("Where the project was created."),
    sources: z
      .array(SourceSchema)
      .max(MAX_SOURCES)
      .optional()
      .describe("Files the video explains; recorded over MCP, not checked in v1."),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .describe("A project's state.");

export type Project = z.output<typeof ProjectSchema>;
export type Gate = (typeof GATES)[number];

/** The gate after `gate`, which approving `gate` moves to; none after render. */
export const nextGate = (gate: Gate): Gate | undefined => GATES[GATES.indexOf(gate) + 1];

export const parseProject = (data: unknown): Validated<Project> => parseWith(ProjectSchema, data);
