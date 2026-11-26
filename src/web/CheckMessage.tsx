import { useState } from "react";
import { type ChatMessage, isFixApplied } from "../schema/chat.ts";
import type { ValidationError } from "../schema/errors.ts";
import type { FixOffer } from "../schema/fixes.ts";
import { applyFix } from "./api.ts";
import { Errors } from "./Errors.tsx";
import { projectHref } from "./route.ts";
import { Pill } from "./ui.tsx";

/** What a fix would change, in a few words: the new words, or what it does. */
const FixPreview = ({ offer }: { offer: FixOffer }) =>
  offer.fix.kind === "words" ? (
    <span className="block text-sm">
      <span className="text-muted">Shorter: </span>“{offer.fix.after}”
    </span>
  ) : (
    <span className="block text-muted text-sm">{offer.label}.</span>
  );

/**
 * What the checks found, as the chat shows it (decision 038): each problem
 * in plain words, a link to its beat in the script, and its fix, with
 * Apply until it is applied and Undo after.
 */
export const CheckMessage = ({
  slug,
  message,
  messages,
}: {
  slug: string;
  message: ChatMessage;
  /** The whole chat, which says whether each fix is applied now. */
  messages: readonly ChatMessage[];
}) => {
  const [working, setWorking] = useState<string>();
  const [errors, setErrors] = useState<{
    readonly id: string;
    readonly errors: readonly ValidationError[];
  }>();
  const found = message.found ?? [];
  const act = async (id: string, undo: boolean) => {
    setWorking(id);
    const done = await applyFix(slug, id, undo);
    setWorking(undefined);
    // The chat says it was done, as the server tells the page.
    setErrors(done.ok ? undefined : { id, errors: done.errors });
  };
  return (
    <ul className="mt-1 flex flex-col gap-2" aria-label="What the checks found">
      {found.map((item) => {
        const offer = message.fixes?.find((f) => f.id === item.fix);
        const applied = offer ? isFixApplied(messages, offer.id) : false;
        return (
          <li key={item.key} className="flex flex-col gap-1">
            <span>{item.text}</span>
            {offer && <FixPreview offer={offer} />}
            <span className="flex flex-wrap items-center gap-2">
              {offer && (
                <Pill
                  disabled={working !== undefined}
                  onClick={() => void act(offer.id, applied)}
                  aria-label={`${applied ? "Undo" : "Apply"}: ${offer.label}`}
                >
                  {applied ? "Undo" : "Apply"}
                </Pill>
              )}
              {offer && applied && <span className="text-muted text-sm">Applied</span>}
              {item.beat && (
                <a
                  className="text-muted text-sm underline hover:text-ink"
                  href={projectHref(slug, "script", item.beat)}
                >
                  Open the beat
                </a>
              )}
            </span>
            {errors?.id === offer?.id && <Errors errors={errors?.errors ?? []} />}
          </li>
        );
      })}
    </ul>
  );
};
