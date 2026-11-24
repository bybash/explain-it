import { z } from "zod";

/**
 * Context: text the user gives the assistant to draft from (SPEC, LLM),
 * kept as files in the project's `context/`. Only text, and only so much of
 * it: above the limit the user is asked to trim, and nothing is summarised.
 */

/** The most characters of context a project can hold, across all its files. */
export const MAX_CONTEXT_CHARS = 100_000;
/** The project folder's context files. */
export const CONTEXT_DIR = "context";
/** The longest name a context file can have. */
export const MAX_CONTEXT_NAME = 80;

/** The kinds of file context can be: notes, Mermaid, and source code, all read as text. */
export const CONTEXT_EXTENSIONS = [
  ".md",
  ".txt",
  ".mmd",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".java",
  ".kt",
  ".rb",
  ".rs",
  ".cs",
  ".php",
  ".swift",
  ".sql",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".html",
  ".css",
  ".sh",
] as const;

/** A context file as listed: its name and how many characters it holds. */
export const ContextFileSchema = z.strictObject({ name: z.string(), chars: z.int().min(0) });
export type ContextFile = z.output<typeof ContextFileSchema>;

/** A project's context: its files, and how much of the limit they use. */
export const ContextListSchema = z.strictObject({
  files: z.array(ContextFileSchema),
  chars: z.int().min(0),
  max: z.int(),
});
export type ContextList = z.output<typeof ContextListSchema>;

/** `POST /api/projects/:slug/context`: a file's name and text, from an upload or a paste. */
export const AddContextSchema = z.strictObject({
  name: z.string().trim().min(1, "must not be empty").max(MAX_CONTEXT_NAME),
  text: z.string().min(1, "must not be empty"),
});
export type AddContext = z.output<typeof AddContextSchema>;
