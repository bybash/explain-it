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
  }, [slug]);

  // Another tab, or later the LLM, adds to the chat too.
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
  const count = messages.length;
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
    <aside className="chat" aria-label="Chat">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="muted chat-empty">Describe the flow the video should explain.</p>
        )}
        {messages.map((m, i) => (
          // A message has no id; its place in the file never changes.
          // biome-ignore lint/suspicious/noArrayIndexKey: chat.jsonl is append-only.
          <div key={i} className="message" data-role={m.role}>
            <span className="message-meta">
              {m.role === "user" ? "You" : "explAIn-it"} · {GATE_LABELS[m.gate]}
            </span>
            <p>{m.text}</p>
          </div>
        ))}
        {problems.length > 0 && (
          <details className="broken">
            <summary>Some lines of chat.jsonl could not be read</summary>
            <Errors errors={problems} />
          </details>
        )}
        <div ref={end} />
      </div>
      <form className="chat-form" onSubmit={send}>
        <label htmlFor="chat-text" className="visually-hidden">
          Message
        </label>
        <textarea
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
        <button type="submit" disabled={sending || text.trim() === ""}>
          Send
        </button>
        <Errors errors={errors} />
      </form>
    </aside>
  );
};
