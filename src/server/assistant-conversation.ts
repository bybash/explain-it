import type { TtsProvider } from "../audio/tts.ts";
import type { LlmClient } from "../llm/client.ts";
import type { ToolContext } from "../mcp/tools.ts";
import { RenderQueue } from "../render/queue.ts";
import { runAssistant } from "./assistant.ts";
import { appendChat, readChat } from "./chat.ts";
import { createEvents } from "./events.ts";
import { makeProject, openProject, projectDir } from "./projects.ts";

/**
 * The conversation recorded with a real model (`npm run llm:record`) and
 * replayed in tests (5.7's "Done when"): a described flow, from the first
 * message to an approved graph and script, through the assistant's tools
 * alone. The clock is fixed and the voice never speaks, so every tool
 * result, and so every step the model is asked, is the same each time.
 */

export const CONVERSATION_PROJECT = "Password reset";
export const CONVERSATION = [
  "Make a video explaining how password reset works in our web app: the user says they forgot their password, the app looks up their account, emails them a one-time link, and the user opens it and chooses a new password.",
  "The graph looks good. I approve it.",
  "Yes, that story works for me. Go ahead and write the script.",
  "The script looks good. I approve it.",
  "One change: shorten beat 2.",
] as const;

const NOW = new Date("2026-11-24T12:00:00.000Z");

/** A voice for the tools that read the voice cache: this conversation never speaks. */
const SILENT: TtsProvider = {
  id: "none",
  generate: async () => {
    throw new Error("the recorded conversation does not speak");
  },
};

/**
 * Plays the conversation on a new project in `projectsDir`, a message at a
 * time, each answered by the assistant at the gate the project is at.
 * Returns the project's slug.
 */
export const playConversation = async (client: LlmClient, projectsDir: string) => {
  const context: ToolContext = {
    projectsDir,
    now: () => NOW,
    events: createEvents(),
    previewUrl: (slug) => `http://127.0.0.1:3000/#/projects/${slug}`,
    missingRenderTools: async () => [],
    runChecks: async () => {
      throw new Error("the recorded conversation runs no checks");
    },
    tts: SILENT,
    renders: new RenderQueue({
      now: () => NOW,
      run: async () => {
        throw new Error("the recorded conversation does not render");
      },
    }),
  };
  const { slug } = await makeProject(
    projectsDir,
    { name: CONVERSATION_PROJECT, origin: "web" },
    NOW,
  );
  for (const text of CONVERSATION) {
    const opened = await openProject(projectsDir, slug);
    const gate = opened?.ok ? opened.value.project.gate : "graph";
    await appendChat(projectDir(projectsDir, slug), [
      { role: "user", text, gate, at: NOW.toISOString() },
    ]);
    await runAssistant({ context, client, slug, gate });
  }
  return { slug, chat: (await readChat(projectDir(projectsDir, slug))).messages };
};
