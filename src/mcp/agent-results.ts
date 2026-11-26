import { z } from "zod";
import type { ContextText } from "../llm/drafting.ts";
import { formatErrors, type Validated } from "../schema/errors.ts";
import { ok } from "../schema/result.ts";
import { readContext } from "../server/context.ts";
import { readHouseRules } from "../server/stories.ts";
import type { ToolContext } from "./tools.ts";

/**
 * Fields the in-app agent never needs: links into the app it is in, the
 * Mermaid the panel already draws, and times that change on every run.
 */
const NOT_FOR_THE_AGENT = new Set(["preview", "mermaid", "createdAt", "updatedAt"]);

/** A tool's result with those fields taken out, at any depth. */
export const forTheAgent = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(forTheAgent);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !NOT_FOR_THE_AGENT.has(key))
      .map(([key, v]) => [key, forTheAgent(v)]),
  );
};

/** What the model reads back from a tool: its result, or its errors named by place. */
export const output = (result: Validated<unknown>): unknown =>
  result.ok ? forTheAgent(result.value) : { errors: formatErrors(result.errors) };

export const inputOf = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;

/** A saving tool's result for the agent, with what the drafting call adds; its errors when it failed. */
export const savedWith = (
  saved: Validated<unknown>,
  extra: Readonly<Record<string, unknown>>,
): unknown =>
  saved.ok ? { ...(forTheAgent(saved.value) as Record<string, unknown>), ...extra } : output(saved);

/** The project could not be opened. */
export const noProject = (slug: string) => ({ errors: [`slug: no project "${slug}" to open`] });

/** The context files a draft names, with their text; an error names one that is not there. */
export const contextTexts = async (
  dir: string,
  names: readonly string[],
): Promise<Validated<ContextText[]>> => {
  const texts: ContextText[] = [];
  for (const name of names) {
    const text = await readContext(dir, name);
    if (!text.ok) return text;
    texts.push({ name, text: text.value });
  }
  return ok(texts);
};

/** The user's house rules for a draft; none when the file is missing or cannot be read. */
export const houseRulesOf = async (context: ToolContext) => {
  const rules = await readHouseRules(context.projectsDir);
  return rules.ok ? rules.value : null;
};
