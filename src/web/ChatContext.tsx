import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  type AddContext,
  CONTEXT_EXTENSIONS,
  type ContextList,
  counted,
  MAX_CONTEXT_CHARS,
  overLimitMessage,
} from "../schema/context.ts";
import type { ValidationError } from "../schema/errors.ts";
import { fail } from "../schema/result.ts";
import { addContextFile, getContext, removeContextFile } from "./api.ts";
import { Errors } from "./Errors.tsx";

/**
 * The chat's context (SPEC, LLM; decision 036): the files the assistant
 * reads when it drafts, how to add and remove them, and why the last change
 * was refused. The chat calls `reload` on its own server events, so the
 * files need no event stream of their own.
 */
export const useChatContext = (slug: string) => {
  const [list, setList] = useState<ContextList | undefined>();
  const [errors, setErrors] = useState<readonly ValidationError[]>([]);

  const load = useCallback(async () => {
    const read = await getContext(slug);
    if (read.ok) setList(read.value);
    else setErrors(read.errors);
  }, [slug]);
  // Read once here; the chat reads it again on its own server events (one stream per page).
  useEffect(() => {
    void load();
  }, [load]);

  /** Adds files in turn; the first one refused stops the rest, and says why. */
  const add = async (files: readonly AddContext[]) => {
    for (const file of files) {
      // One over the limit by itself is refused here: it may be too large for the API to read at all.
      const added =
        file.text.length > MAX_CONTEXT_CHARS
          ? fail([
              {
                path: "text",
                message: overLimitMessage(file.name, (list?.chars ?? 0) + file.text.length),
              },
            ])
          : await addContextFile(slug, file);
      if (!added.ok) {
        await load();
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
    if (!left.ok) return setErrors(left.errors);
    // The user did what the refusal asked, so it goes.
    setErrors([]);
    setList(left.value);
  };
  /** Reads the files chosen, as UTF-8; one that is not is refused rather than altered. */
  const attach = async (chosen: readonly File[]) => {
    const files: AddContext[] = [];
    for (const file of chosen) {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
        files.push({ name: file.name, text });
      } catch {
        return setErrors([{ path: file.name, message: "not UTF-8 text, so it was not added" }]);
      }
    }
    await add(files);
  };
  return { list, errors, add, attach, remove, reload: load };
};

/** The chips of the attached files and the paperclip, above the message box. */
export const ChatContext = ({ context }: { context: ReturnType<typeof useChatContext> }) => {
  const picker = useRef<HTMLInputElement>(null);
  const { list, errors, attach, remove } = context;
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = [...(event.target.files ?? [])];
    event.target.value = "";
    void attach(chosen);
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
        onChange={choose}
      />
      <Errors className="w-full" errors={errors} />
    </section>
  );
};
