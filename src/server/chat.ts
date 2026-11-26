import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CHAT_FILE,
  type Chat,
  type ChatMessage,
  type NewChatMessage,
  parseChatLines,
} from "../schema/chat.ts";
import { projectDir, projectExists, withProjectLock } from "./projects.ts";

/** A project's chat: every message that reads, and the lines that do not. */
export const readChat = async (dir: string): Promise<Omit<Chat, "working">> => {
  try {
    return parseChatLines(await readFile(join(dir, CHAT_FILE), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { messages: [], problems: [] };
    throw error;
  }
};

const readText = async (file: string): Promise<string> => {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
};

/**
 * Adds messages to the end of a project's chat, one line each, in one write.
 * A last line a crash left unfinished is ended first, so it stays the only
 * broken one.
 */
export const appendChat = async (dir: string, messages: readonly ChatMessage[]): Promise<void> => {
  const file = join(dir, CHAT_FILE);
  const existing = await readText(file);
  const start = existing === "" || existing.endsWith("\n") ? "" : "\n";
  await appendFile(file, start + messages.map((m) => `${JSON.stringify(m)}\n`).join(""));
};

/**
 * Saves what the user sent, at the gate they were looking at; the assistant
 * answers it after (see `assistant.ts`). Undefined when there is no such project. Only the folder is
 * needed: a broken project.json does not stop the conversation about it.
 */
export const addChat = (
  projectsDir: string,
  slug: string,
  sent: NewChatMessage,
  now: Date,
): Promise<ChatMessage[] | undefined> =>
  withProjectLock(projectsDir, slug, async () => {
    if (!(await projectExists(projectsDir, slug))) return undefined;
    const at = now.toISOString();
    const messages: ChatMessage[] = [{ role: "user", text: sent.text, at, gate: sent.gate }];
    await appendChat(projectDir(projectsDir, slug), messages);
    return messages;
  });
