import { z } from "zod";
import { parseWith, type ValidationError, ValidationErrorSchema } from "./errors.ts";
import { FixDoneSchema, FixOfferSchema } from "./fixes.ts";
import { GATES } from "./project.ts";

/**
 * The conversation in `chat.jsonl` (SPEC, Project folder): one message a
 * line, appended, so a crash loses at most the line being written.
 */

/** The longest message a user can send. */
export const MAX_CHAT_MESSAGE = 4000;
/** The chat's file in a project folder. */
export const CHAT_FILE = "chat.jsonl";

export const ChatMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1),
  at: z.iso.datetime(),
  /** The gate the user was looking at when the message was sent. */
  gate: z.enum(GATES),
  /**
   * What the assistant adds besides its replies, none of it read back to it:
   * a line as it works ("Saved the graph."), what the checks found, with
   * fixes to offer, and a fix applied or undone.
   */
  kind: z.enum(["step", "checks", "fix"]).optional(),
  /** A step that did not work: shown as such, not with a tick. */
  failed: z.literal(true).optional(),
  /** The fixes a "checks" message offers. */
  fixes: z.array(FixOfferSchema).optional(),
  /** What a "fix" message did. */
  fix: FixDoneSchema.optional(),
});
export type ChatMessage = z.output<typeof ChatMessageSchema>;

/** `POST /api/projects/:slug/chat`: what the user typed. */
export const NewChatMessageSchema = z.strictObject({
  text: z.string().trim().min(1, "must not be empty").max(MAX_CHAT_MESSAGE),
  /** The gate the user is looking at, which the message is saved with. */
  gate: z.enum(GATES),
});
export type NewChatMessage = z.output<typeof NewChatMessageSchema>;

/** `GET /api/projects/:slug/chat`: the messages, and the lines that could not be read. */
export const ChatSchema = z.object({
  messages: z.array(ChatMessageSchema),
  problems: z.array(ValidationErrorSchema),
  /** Whether the assistant is still answering the last message. */
  working: z.boolean(),
});
export type Chat = z.output<typeof ChatSchema>;

/** The messages in `chat.jsonl` text; a broken line is named by its number and skipped. */
export const parseChatLines = (text: string): Omit<Chat, "working"> => {
  const messages: ChatMessage[] = [];
  const problems: ValidationError[] = [];
  text.split("\n").forEach((line, i) => {
    if (line.trim() === "") return;
    const where = `${CHAT_FILE} line ${i + 1}`;
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      problems.push({ path: where, message: "not valid JSON" });
      return;
    }
    const message = parseWith(ChatMessageSchema, data);
    if (message.ok) messages.push(message.value);
    else
      problems.push(
        ...message.errors.map((e) => ({ path: `${where}: ${e.path}`, message: e.message })),
      );
  });
  return { messages, problems };
};
