import { useEffect, useState } from "react";
import type { OpenedProject } from "../schema/api.ts";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import type { ValidationError } from "../schema/errors.ts";
import { MAX_SCENES, parseStoryboard, type Storyboard } from "../schema/storyboard.ts";
import { getMeasuredLines, saveStoryboard } from "./api.ts";
import { BeatCard } from "./BeatCard.tsx";
import { Errors } from "./Errors.tsx";
import { SceneCard } from "./SceneCard.tsx";
import {
  addAction,
  addBeat,
  addScene,
  beatHints,
  editBeat,
  editScene,
  moveBeat,
  removeAction,
  removeBeat,
  removeScene,
  starterScript,
} from "./script-model.ts";
import { Muted, Pill } from "./ui.tsx";

const same = (a: Storyboard | null, b: Storyboard | null) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Problems the schema finds, split by where the editor shows them: under a beat, a scene, or the whole script. */
const placeErrors = (errors: readonly ValidationError[]) => {
  const at = new Map<string, string[]>();
  for (const { path, message } of errors) {
    const where = /^(scenes\[\d+\](?:\.beats\[\d+\])?)\.?(.*)$/.exec(path);
    const key = where?.[1] ?? "";
    const field = where ? where[2] : path;
    at.set(key, [...(at.get(key) ?? []), field ? `${field}: ${message}` : message]);
  }
  return (key: string) => at.get(key) ?? [];
};

/**
 * The Script gate's editor (SPEC, User flow): the scenes and their beats as
 * a form, a starter script made from the graph when there is none yet, each
 * beat's length and hints as it is written, and the beats a graph edit made
 * stale. Saved as MCP's `set_storyboard` saves it. `blocked` says why the
 * gate cannot be approved while there are changes not saved.
 */
export const ScriptPanel = ({
  opened,
  blocked,
}: {
  opened: OpenedProject;
  blocked: (reason: string | undefined) => void;
}) => {
  const { slug, graph } = opened;
  const [saved, setSaved] = useState(opened.storyboard);
  const [draft, setDraft] = useState(opened.storyboard);
  const [errors, setErrors] = useState<readonly ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [measured, setMeasured] = useState<Readonly<Record<string, number>>>({});
  const unsaved = !same(draft, saved);

  // A script saved elsewhere (over MCP, or in another tab) shows here, unless this one has changes.
  const fromServer = JSON.stringify(opened.storyboard);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new script from the server resets the draft.
  useEffect(() => {
    setSaved(opened.storyboard);
    if (!unsaved) setDraft(opened.storyboard);
  }, [fromServer]);

  // The lines already spoken, so a beat's length and hints match the checks; read again after each save.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a save may change which lines are spoken.
  useEffect(() => {
    let open = true;
    void getMeasuredLines(slug).then((result) => {
      if (open && result.ok) setMeasured(result.value.seconds);
    });
    return () => {
      open = false;
    };
  }, [slug, saved]);

  useEffect(() => {
    blocked(unsaved ? "Save the script first." : undefined);
    return () => blocked(undefined);
  }, [blocked, unsaved]);

  if (!graph) return <Muted>The script tells the graph's story: make the graph first.</Muted>;

  if (!draft)
    return (
      <section className="rounded-box border border-line bg-surface p-4" aria-label="Script">
        <h3 className="font-bold text-base">The script</h3>
        <p className="mt-1 mb-3 text-muted text-sm">
          No script yet. Start from the graph: a beat for each step of the flow, with its captions
          from the labels. Then write each beat's words.
        </p>
        <button className="btn" type="button" onClick={() => setDraft(starterScript(graph))}>
          Start from the graph
        </button>
      </section>
    );

  const checked = parseStoryboard(draft, graph);
  const errorsAt = placeErrors(checked.ok ? errors : checked.errors);
  const hints = beatHints(draft, graph, opened.config ?? DEFAULT_CONFIG, measured);
  const stale = new Set(opened.project.staleBeats);
  const staleHere = draft.scenes.flatMap((s) => s.beats).filter((b) => stale.has(b.id)).length;
  const edit = (next: Storyboard) => {
    setDraft(next);
    setJustSaved(false);
    setErrors([]);
  };

  const save = async () => {
    setSaving(true);
    const result = await saveStoryboard(slug, draft);
    setSaving(false);
    if (!result.ok) return setErrors(result.errors);
    setErrors([]);
    setSaved(result.value.storyboard);
    setDraft(result.value.storyboard);
    setJustSaved(true);
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Script">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-bold text-base">The script</h3>
        <button
          className="btn ml-auto"
          type="button"
          onClick={save}
          disabled={saving || !unsaved || !checked.ok}
        >
          Save the script
        </button>
        {justSaved && !unsaved && (
          <span className="text-muted" role="status">
            Saved.
          </span>
        )}
      </div>
      {staleHere > 0 && (
        <p className="text-sm text-warn">
          {staleHere === 1 ? "One beat names" : `${staleHere} beats name`} a part of the graph that
          changed. Check {staleHere === 1 ? "it" : "them"}, then save: a beat you change is no
          longer stale.
        </p>
      )}
      {!checked.ok && (
        <p className="text-muted text-sm">
          The script can be saved once every problem below is fixed.
        </p>
      )}
      <Errors errors={errorsAt("").map((message) => ({ path: "script", message }))} />

      {draft.scenes.map((scene, s) => (
        <SceneCard
          key={scene.id}
          number={s + 1}
          graph={graph}
          scene={scene}
          errors={errorsAt(`scenes[${s}]`)}
          canRemove={draft.scenes.length > 1}
          title={(title) => edit(editScene(draft, s, { title }))}
          nodes={(nodes) => edit(editScene(draft, s, { nodes }))}
          remove={() => edit(removeScene(draft, s))}
        >
          {scene.beats.length === 0 ? (
            <Pill onClick={() => edit(addBeat(draft, s, -1))}>Add a beat</Pill>
          ) : (
            <ol className="flex flex-col gap-3" aria-label={`Beats of scene ${s + 1}`}>
              {scene.beats.map((beat, b) => (
                <BeatCard
                  key={beat.id}
                  number={b + 1}
                  beat={beat}
                  scene={scene}
                  graph={graph}
                  hint={hints?.get(beat.id)}
                  stale={stale.has(beat.id)}
                  errors={errorsAt(`scenes[${s}].beats[${b}]`)}
                  first={b === 0}
                  last={b === scene.beats.length - 1}
                  controls={{
                    change: (next) => edit(editBeat(draft, s, b, () => next)),
                    addAction: (type) => edit(addAction(draft, graph, s, b, type)),
                    removeAction: (a) => edit(removeAction(draft, s, b, a)),
                    move: (by) => edit(moveBeat(draft, s, b, by)),
                    remove: () => edit(removeBeat(draft, s, b)),
                    addAfter: () => edit(addBeat(draft, s, b)),
                  }}
                />
              ))}
            </ol>
          )}
        </SceneCard>
      ))}
      {draft.scenes.length < MAX_SCENES && (
        <Pill className="self-start" onClick={() => edit(addScene(draft))}>
          Add a scene
        </Pill>
      )}
    </section>
  );
};
