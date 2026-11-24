import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { type ChatMessage, MAX_CHAT_MESSAGE } from "../schema/chat.ts";
import type { ValidationError } from "../schema/errors.ts";
import type { Gate } from "../schema/project.ts";
import { getChat, onServerEvents, sendChat } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { GATE_LABELS } from "./labels.ts";

/** The chat column: the conversation in chat.jsonl, and a box to add to it. Keyed by project, so one project's chat never shows in another's. */
export const Chat = ({ slug, gate }: { slug: string; gate: Gate }) => {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [problems, setProblems] = useState<readonly ValidationError[]>([]);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<readonly ValidationError[]>([]);
  const [sending, setSending] = useState(false);
  /** Whether the assistant is still answering, as the server last said. */
  const [working, setWorking] = useState(false);
  const end = useRef<HTMLDivElement>(null);

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
      },
    });
  }, [load, slug]);

  // The newest message stays in sight.
  const count = messages.length + (working ? 1 : 0);
  useEffect(() => {
    if (count > 0) end.current?.scrollIntoView?.({ block: "end" });
  }, [count]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
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
      className="sticky top-4 flex h-[calc(100vh-56px-64px)] min-h-[420px] flex-col rounded-box border border-line bg-surface"
      aria-label="Chat"
    >
      <div className="flex-1 overflow-y-auto p-4">
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
                m.kind === "step"
                  ? "-mt-1 mb-2 px-3 text-muted text-sm"
                  : "mb-3 rounded-box bg-page px-3 py-2.5 data-[role=user]:bg-accent-soft"
              }
              data-role={m.role}
              {...(m.kind ? { "data-kind": m.kind } : {})}
            >
              {m.kind === "step" ? (
                `✓ ${m.text}`
              ) : (
                <>
                  <span className="font-semibold text-muted text-xs">
                    {m.role === "user" ? "You" : "explAIn-it"} · {GATE_LABELS[m.gate]}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap">{m.text}</p>
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
        <div ref={end} />
      </div>
      <form className="grid grid-cols-[1fr_auto] gap-2 border-line border-t p-3" onSubmit={send}>
        <label htmlFor="chat-text" className="sr-only">
          Message
        </label>
        <textarea
          className="field resize-none bg-page"
          id="chat-text"
          value={text}
          rows={3}
          maxLength={MAX_CHAT_MESSAGE}
          placeholder="Write a message…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="btn self-end"
          type="submit"
          disabled={sending || working || text.trim() === ""}
        >
          Send
        </button>
        <Errors className="col-span-full" errors={errors} />
      </form>
    </aside>
  );
};
