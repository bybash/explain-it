import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { type ChatMessage, MAX_CHAT_MESSAGE } from "../schema/chat.ts";
import { counted } from "../schema/context.ts";
import type { ValidationError } from "../schema/errors.ts";
import type { Gate } from "../schema/project.ts";
import { getChat, onServerEvents, sendChat } from "./api.ts";
import { ChatContext, useChatContext } from "./ChatContext.tsx";
import { CheckMessage } from "./CheckMessage.tsx";
import { Errors } from "./Errors.tsx";
import { GATE_LABELS } from "./labels.ts";
import { Markdown } from "./Markdown.tsx";

/** The chat: the conversation in chat.jsonl, and a box to add to it. Keyed by project, so one project's chat never shows in another's. */
export const Chat = ({
  slug,
  gate,
  hidden,
  full,
}: {
  slug: string;
  gate: Gate;
  /** Out of sight, but kept, with what is typed in it. */
  hidden: boolean;
  /** Alone on the page: a message is kept to a line's readable length. */
  full: boolean;
}) => {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [problems, setProblems] = useState<readonly ValidationError[]>([]);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<readonly ValidationError[]>([]);
  const [sending, setSending] = useState(false);
  /** Whether the assistant is still answering, as the server last said. */
  const [working, setWorking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const context = useChatContext(slug);
  const reloadContext = context.reload;

  // An answer that arrives after the column is gone, or after another project opened, is dropped.
  // Set on every mount, since React's strict mode mounts twice in development.
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const chat = await getChat(slug);
    if (!live.current) return;
    if (!chat.ok) return setErrors(chat.errors);
    setErrors([]);
    setMessages(chat.value.messages);
    setProblems(chat.value.problems);
    setWorking(chat.value.working);
  }, [slug]);

  // Another tab, and the assistant as it works, add to the chat too.
  useEffect(() => {
    void load();
    return onServerEvents({
      connected: () => void load(),
      event: (event) => {
        if (event.type === "chat" && event.slug === slug) void load();
        if (event.type === "project-updated" && event.slug === slug) void reloadContext();
      },
    });
  }, [load, reloadContext, slug]);

  // The newest message stays in sight, without scrolling the page around the chat.
  const count = messages.length + (working ? 1 : 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each of these moves the end.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [count, hidden, full]);
  const column = full ? "mx-auto w-full max-w-[820px]" : "";

  // The box takes any paste, which a cap would cut without a word; only sending is limited.
  const tooLong = text.trim().length > MAX_CHAT_MESSAGE;
  const canSend = !sending && !working && !tooLong && text.trim() !== "";

  const send = async (event: FormEvent) => {
    event.preventDefault();
    // Enter submits whether or not the button can be pressed.
    if (!canSend) return;
    setSending(true);
    const sent = await sendChat(slug, text, gate);
    if (!live.current) return;
    setSending(false);
    if (!sent.ok) return setErrors(sent.errors);
    setErrors([]);
    setText("");
    await load();
  };

  return (
    <aside
      className="sticky top-20 flex h-[calc(100dvh-196px)] min-h-[420px] flex-col rounded-box border border-line bg-surface"
      aria-label="Chat"
      hidden={hidden}
    >
      <div className="flex-1 overflow-y-auto p-4" ref={scroller}>
        <div className={column}>
          {messages.length === 0 && (
            <p className="text-muted">Describe the flow the video should explain.</p>
          )}
          <ol aria-label="Messages">
            {messages.map((m, i) => (
              <li
                // A message has no id; its place in the file never changes.
                // biome-ignore lint/suspicious/noArrayIndexKey: chat.jsonl is append-only.
                key={i}
                className={
                  m.kind === "step" || m.kind === "fix"
                    ? `-mt-1 mb-2 px-3 text-sm ${m.failed ? "text-error" : "text-muted"}`
                    : "mb-3 rounded-box bg-page px-3 py-2.5 data-[role=user]:bg-accent-soft"
                }
                data-role={m.role}
                {...(m.kind ? { "data-kind": m.kind } : {})}
              >
                {m.kind === "step" || m.kind === "fix" ? (
                  <>
                    <span aria-hidden="true">
                      {m.failed ? "✗ " : m.fix?.done === "undone" ? "↶ " : "✓ "}
                    </span>
                    {m.text}
                  </>
                ) : m.kind === "checks" ? (
                  <>
                    <span className="font-semibold text-muted text-xs">
                      Checks · {GATE_LABELS[m.gate]}
                    </span>
                    <CheckMessage slug={slug} message={m} messages={messages} />
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-muted text-xs">
                      {m.role === "user" ? "You" : "explAIn-it"} · {GATE_LABELS[m.gate]}
                    </span>
                    <div className="mt-1">
                      <Markdown text={m.text} />
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
          {working && (
            <p className="px-3 text-muted text-sm" role="status">
              The assistant is working…
            </p>
          )}
          {problems.length > 0 && (
            <details className="mt-6 text-muted">
              <summary>Some lines of chat.jsonl could not be read</summary>
              <Errors errors={problems} />
            </details>
          )}
        </div>
      </div>
      <form className="border-line border-t p-3" onSubmit={send}>
        <div className={`grid grid-cols-[1fr_auto] gap-2 ${column}`}>
          <ChatContext context={context} />
          <label htmlFor="chat-text" className="sr-only">
            Message
          </label>
          {/* It grows with what is typed, up to a few lines, then scrolls. */}
          <textarea
            className={`field max-h-60 resize-none bg-page [field-sizing:content] ${full ? "min-h-26" : "min-h-21"}`}
            id="chat-text"
            value={text}
            placeholder="Write a message…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="flex flex-col gap-1.5 self-end">
            <button
              type="button"
              className="text-muted text-xs underline hover:text-ink disabled:no-underline disabled:opacity-50"
              disabled={text.trim() === ""}
              title="Save what is in the box as a file of context, instead of sending it"
              onClick={async () => {
                // What was typed while it was saved stays in the box.
                if (await context.add([{ name: "pasted.md", text }]))
                  setText((now) => (now === text ? "" : now));
              }}
            >
              Add as context
            </button>
            <button className="btn" type="submit" disabled={!canSend}>
              Send
            </button>
          </div>
          {tooLong && (
            <p className="col-span-full text-sm text-warn" role="status">
              {counted(text.length)} characters is too long to send (at most{" "}
              {counted(MAX_CHAT_MESSAGE)}): add it as context, and say what to do with it.
            </p>
          )}
          <Errors className="col-span-full" errors={errors} />
        </div>
      </form>
    </aside>
  );
};
