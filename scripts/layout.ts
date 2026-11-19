// Lays out a project's graph and writes its layout.json, keeping any overrides
// already in the file. Usage: node scripts/layout.ts examples/oauth-login
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { layoutGraph } from "../src/layout/layout.ts";
import { formatErrors } from "../src/schema/errors.ts";
import { parseGraph } from "../src/schema/graph.ts";
import { LayoutSchema } from "../src/schema/layout.ts";

const [project] = process.argv.slice(2);
if (!project) throw new Error("usage: node scripts/layout.ts <project folder>");

const readJson = (file: string): unknown => JSON.parse(readFileSync(join(project, file), "utf8"));

const graph = parseGraph(readJson("graph.json"));
if (!graph.ok) throw new Error(`graph.json:\n${formatErrors(graph.errors).join("\n")}`);

// Overrides are the user's choices; read them from the existing file, if any.
const layoutFile = join(project, "layout.json");
const previous = existsSync(layoutFile) ? LayoutSchema.safeParse(readJson("layout.json")) : null;
const overrides = previous?.success ? previous.data.overrides : {};

const layout = await layoutGraph(graph.value, overrides);
if (!layout.ok) throw new Error(`layout:\n${formatErrors(layout.errors).join("\n")}`);

const file = { $schema: "../../schemas/layout.schema.json", ...layout.value };
writeFileSync(layoutFile, `${JSON.stringify(file, null, 2)}\n`);
console.log(`wrote ${layoutFile}`);
