import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CHAT_FILE, type Chat, type ChatMessage, parseChatLines } from "../schema/chat.ts";

/**
 * The assistant's reply until the LLM arrives (Milestone 5): it says plainly
 * that nothing read the message, and what works instead.
 */
export const STUB_REPLY =
  "The assistant is not connected yet: it comes with the LLM in a later version. For now, edit in the panel and approve each gate with its button.";

/** A project's chat: every message that reads, and the lines that do not. */
export const readChat = async (dir: string): Promise<Chat> => {
  try {
    return parseChatLines(await readFile(join(dir, CHAT_FILE), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { messages: [], problems: [] };
    throw error;
  }
};

/** Adds messages to the end of a project's chat, one line each, in one write. */
export const appendChat = async (dir: string, messages: readonly ChatMessage[]): Promise<void> => {
  await appendFile(join(dir, CHAT_FILE), messages.map((m) => `${JSON.stringify(m)}\n`).join(""));
};
