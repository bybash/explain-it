import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { jsonSchemaFiles } from "../src/schema/json-schema.ts";

const dir = new URL("../schemas/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const file of readdirSync(dir)) {
  if (file.endsWith(".json")) rmSync(new URL(file, dir));
}
for (const [file, content] of Object.entries(jsonSchemaFiles())) {
  writeFileSync(new URL(file, dir), content);
  console.log(`wrote schemas/${file}`);
}
