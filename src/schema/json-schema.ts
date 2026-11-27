import { z } from "zod";
import { CardSchema } from "./card.ts";
import { ConfigSchema } from "./config.ts";
import { GraphSchema } from "./graph.ts";
import { LayoutSchema } from "./layout.ts";
import { ProjectSchema } from "./project.ts";
import { BriefSchema } from "./story.ts";
import { StoryboardSchema } from "./storyboard.ts";

const SCHEMAS = {
  graph: GraphSchema,
  storyboard: StoryboardSchema,
  config: ConfigSchema,
  project: ProjectSchema,
  layout: LayoutSchema,
  brief: BriefSchema,
  card: CardSchema,
} as const;

const SCHEMA_BASE_URL = "https://raw.githubusercontent.com/bybash/explain-it/main/schemas/";

/**
 * The published JSON Schemas, as file name → file content. Derived from the
 * zod schemas, which stay the only source of truth. Input shapes are used, so
 * fields with defaults are optional, as they are when writing a file.
 */
export const jsonSchemaFiles = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(SCHEMAS).map(([name, schema]) => {
      const file = `${name}.schema.json`;
      const json = {
        $id: `${SCHEMA_BASE_URL}${file}`,
        ...z.toJSONSchema(schema, { io: "input", target: "draft-2020-12" }),
      };
      return [file, `${JSON.stringify(json, null, 2)}\n`];
    }),
  );
