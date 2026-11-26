import { readFileSync } from "node:fs";

/** The prompts in `prompts/`, by name: Markdown, with `{{place}}` for what each call fills in (SPEC, LLM). */
const PROMPTS = ["draft-graph", "draft-script"] as const;
export type PromptName = (typeof PROMPTS)[number];

const read = (name: PromptName) =>
  readFileSync(new URL(`./prompts/${name}.md`, import.meta.url), "utf8");

/**
 * A prompt with its places filled. A place with no value is a bug, not
 * something to send: it throws, naming the place.
 */
export const prompt = (name: PromptName, values: Readonly<Record<string, string>>): string =>
  read(name)
    .replace(/\{\{(\w+)\}\}/g, (_, place: string) => {
      const value = values[place];
      if (value === undefined)
        throw new Error(`the prompt "${name}" has no value for {{${place}}}`);
      return value;
    })
    .trim();
