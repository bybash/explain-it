import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { CONTEXT_EXTENSIONS, type ContextList } from "../schema/context.ts";
import type { ValidationError } from "../schema/errors.ts";
import { addContextFile, getContext, removeContextFile } from "./api.ts";
import { Errors } from "./Errors.tsx";

/** A count as people read it: "12,345". */
const counted = (n: number) => n.toLocaleString("en-GB");

/**
 * The chat's context (SPEC, LLM; decision 036): the files the assistant
 * reads when it drafts, as chips with a button to remove each, and a
 * paperclip to attach more. `addText` gives the parent a way to add what
 * is in its message box as a file.
 */
export const useChatContext = (slug: string) => {
  const [list, setList] = useState<ContextList | undefined>();
  const [errors, setErrors] = useState<readonly ValidationError[]>([]);

  const load = useCallback(async () => {
    const read = await getContext(slug);
    if (read.ok) setList(read.value);
  }, [slug]);
  // Read once here; the chat reads it again on its own server events (one stream per page).
  useEffect(() => {
    void load();
  }, [load]);

  /** Adds files in turn; the first one refused stops the rest, and says why. */
  const add = async (files: readonly { name: string; text: string }[]) => {
    for (const file of files) {
      const added = await addContextFile(slug, file);
      if (!added.ok) {
        setErrors(added.errors);
        return false;
      }
    }
    setErrors([]);
    await load();
    return true;
  };
  const remove = async (name: string) => {
    const left = await removeContextFile(slug, name);
    if (left.ok) setList(left.value);
    else setErrors(left.errors);
  };
  return { list, errors, add, remove, reload: load };
};

/** The chips of the attached files and the paperclip, above the message box. */
export const ChatContext = ({ context }: { context: ReturnType<typeof useChatContext> }) => {
  const picker = useRef<HTMLInputElement>(null);
  const { list, errors, add, remove } = context;
  const attach = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = [...(event.target.files ?? [])];
    event.target.value = "";
    await add(await Promise.all(chosen.map(async (f) => ({ name: f.name, text: await f.text() }))));
  };
  return (
    <section className="col-span-full flex flex-wrap items-center gap-1.5" aria-label="Context">
      {list?.files.map((f) => (
        <span
          key={f.name}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-page px-2 py-0.5 text-xs"
          title={`${counted(f.chars)} characters`}
        >
          {f.name}
          <button
            type="button"
            className="text-muted hover:text-ink"
            aria-label={`Remove ${f.name} from the context`}
            onClick={() => void remove(f.name)}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        className="rounded-full px-1.5 text-muted text-sm hover:text-ink"
        aria-label="Attach files as context"
        title="Attach files the assistant can read: notes, a spec, Mermaid or code"
        onClick={() => picker.current?.click()}
      >
        📎
      </button>
      {list && list.chars > 0 && (
        <span className="text-muted text-xs">
          {counted(list.chars)} of {counted(list.max)} characters
        </span>
      )}
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        accept={CONTEXT_EXTENSIONS.join(",")}
        onChange={(e) => void attach(e)}
      />
      <Errors className="w-full" errors={errors} />
    </section>
  );
};
