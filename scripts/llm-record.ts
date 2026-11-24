// Records the LLM calls in src/llm/recordings.ts with the model in Settings,
// as fixtures for the tests to replay with no key. Calls already recorded are
// replayed, not made again: delete a fixture to record it anew.
// Usage: npm run llm:record   (reads .env, or ENV_FILE; never prints the key)
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FIXTURES_DIR, fixtureClient } from "../src/llm/fixtures.ts";
import { providerClient } from "../src/llm/provider.ts";
import { RECORDED_CALLS } from "../src/llm/recordings.ts";
import { formatErrors } from "../src/schema/errors.ts";
import { playConversation } from "../src/server/assistant-conversation.ts";
import { settingsStore } from "../src/server/settings.ts";

const settings = settingsStore({
  envFile: resolve(process.env.ENV_FILE ?? ".env"),
  environment: process.env,
});
const { baseUrl, model } = await settings.current();
console.log(`recording with ${model} at ${new URL(baseUrl).hostname}`);
const client = fixtureClient({
  dir: FIXTURES_DIR,
  record: providerClient({ settings: settings.current }),
});
let failed = false;
for (const call of RECORDED_CALLS) {
  const result = await call.run(client);
  console.log(
    result.ok ? `${call.name}: ok` : `${call.name}:\n  ${formatErrors(result.errors).join("\n  ")}`,
  );
  failed ||= !result.ok;
}
// The assistant's conversation (5.7), played on a project of its own that is then removed.
const scratch = mkdtempSync(join(tmpdir(), "explain-it-record-"));
try {
  const { chat } = await playConversation(client, scratch);
  for (const m of chat)
    console.log(`  ${m.role}${m.kind ? ` (${m.kind})` : ""}: ${m.text.slice(0, 160)}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
