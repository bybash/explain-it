// Lays out a project's graph and writes its layout.json, keeping any overrides
// already in the file. Usage: node scripts/layout.ts examples/oauth-login
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { layoutGraph } from "../src/layout/layout.ts";
import { formatErrors } from "../src/schema/errors.ts";
import { parseGraph } from "../src/schema/graph.ts";
import { parseLayout } from "../src/schema/layout.ts";

const [project] = process.argv.slice(2);
if (!project) throw new Error("usage: node scripts/layout.ts <project folder>");

const readJson = (file: string): unknown => JSON.parse(readFileSync(join(project, file), "utf8"));

const graph = parseGraph(readJson("graph.json"));
if (!graph.ok) throw new Error(`graph.json:\n${formatErrors(graph.errors).join("\n")}`);

// Overrides are the user's choices: keep them from the existing file. If that
// file is broken, stop rather than overwrite it and lose them.
const layoutFile = join(project, "layout.json");
const overridesOf = (): Record<string, { x: number; y: number }> => {
  if (!existsSync(layoutFile)) return {};
  const previous = parseLayout(readJson("layout.json"), graph.value);
  if (previous.ok) return previous.value.overrides;
  throw new Error(
    `${layoutFile} is invalid, so its overrides cannot be kept. Fix or delete it first:\n` +
      formatErrors(previous.errors).join("\n"),
  );
};
const overrides = overridesOf();

const layout = await layoutGraph(graph.value, overrides);
if (!layout.ok) throw new Error(`layout:\n${formatErrors(layout.errors).join("\n")}`);

const file = { $schema: "../../schemas/layout.schema.json", ...layout.value };
writeFileSync(layoutFile, `${JSON.stringify(file, null, 2)}\n`);
console.log(`wrote ${layoutFile}`);
