import type { z } from "zod";
import {
  ApprovedSchema,
  BriefSavedSchema,
  ChecksRunSchema,
  CreatedProjectSchema,
  ErrorsResponseSchema,
  GraphReadSchema,
  GraphSavedSchema,
  HouseRulesBodySchema,
  MeasuredLinesSchema,
  type OpenedProject,
  OpenedProjectSchema,
  PreviewChecksSchema,
  PreviewSoundSchema,
  type ProjectList,
  ProjectListSchema,
  type RenderAsk,
  RendersViewSchema,
  SavedLogoSchema,
  type ServerEvent,
  ServerEventSchema,
  StoryboardSavedSchema,
  type StyleEdit,
  StyleSavedSchema,
} from "../schema/api.ts";
import { type Chat, ChatMessageSchema, ChatSchema } from "../schema/chat.ts";
import type { Config, VoiceConfig } from "../schema/config.ts";
import { type AddContext, ContextFileSchema, ContextListSchema } from "../schema/context.ts";
import { parseWith, type Validated, type ValidationError } from "../schema/errors.ts";
import type { Gate } from "../schema/project.ts";
import { RenderJobSchema } from "../schema/render.ts";
import { fail, ok } from "../schema/result.ts";
import { type SettingsUpdate, type SettingsView, SettingsViewSchema } from "../schema/settings.ts";
import type { Brief } from "../schema/story.ts";
import type { Storyboard } from "../schema/storyboard.ts";

/**
 * Calls the API and checks what comes back against its schema. Expected
 * failures, such as a name that is too long, come back as errors that name
 * the field; a server that sends something else is reported the same way.
 */
const fetchChecked = async <S extends z.ZodType>(
  schema: S,
  url: string,
  init?: RequestInit,
): Promise<Validated<z.output<S>>> => {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    return fail([
      { path: "(network)", message: `could not reach the server: ${(error as Error).message}` },
    ]);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fail([
      { path: "(response)", message: `the server sent ${response.status} without JSON` },
    ]);
  }
  if (!response.ok) return fail(errorsIn(body, response.status));
  return parseWith(schema, body);
};

/** The errors a failed response names, or its status when it names none. */
const errorsIn = (body: unknown, status: number): readonly ValidationError[] => {
  const errors = ErrorsResponseSchema.safeParse(body);
  return errors.success
    ? errors.data.errors
    : [{ path: "(response)", message: `status ${status}` }];
};

/** A sound from the API, as a WAV to play, or the errors it answered with. */
const fetchSound = async (url: string, signal: AbortSignal): Promise<Validated<Blob>> => {
  try {
    const response = await fetch(url, { signal });
    if (response.ok) return ok(await response.blob());
    return fail(errorsIn(await response.json().catch(() => null), response.status));
  } catch (error) {
    if (signal.aborted) throw error;
    return fail([
      { path: "(network)", message: `could not reach the server: ${(error as Error).message}` },
    ]);
  }
};

/** The project's voice speaking the script's first line. */
export const voiceSample = (
  slug: string,
  { id, speed }: Pick<VoiceConfig, "id" | "speed">,
  signal: AbortSignal,
) =>
  fetchSound(
    `/api/projects/${encodeURIComponent(slug)}/samples/voice?${new URLSearchParams({ voice: id, speed: String(speed) })}`,
    signal,
  );

/** A few seconds of the music. */
export const musicSample = (
  { mood, seed, volumeDb }: Pick<Config["music"], "mood" | "seed" | "volumeDb">,
  signal: AbortSignal,
) =>
  fetchSound(
    `/api/samples/music?${new URLSearchParams({ mood, seed: String(seed), volumeDb: String(volumeDb) })}`,
    signal,
  );

export const listProjects = (): Promise<Validated<ProjectList>> =>
  fetchChecked(ProjectListSchema, "/api/projects");

export const openProject = (slug: string): Promise<Validated<OpenedProject>> =>
  fetchChecked(OpenedProjectSchema, `/api/projects/${encodeURIComponent(slug)}`);

export const createProject = (name: string) =>
  fetchChecked(CreatedProjectSchema, "/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });

export const getChat = (slug: string): Promise<Validated<Chat>> =>
  fetchChecked(ChatSchema, `/api/projects/${encodeURIComponent(slug)}/chat`);

const postJson = <S extends z.ZodType>(schema: S, url: string, body: unknown) =>
  fetchChecked(schema, url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export const sendChat = (slug: string, text: string, gate: Gate) =>
  postJson(ChatSchema.pick({ messages: true }), `/api/projects/${encodeURIComponent(slug)}/chat`, {
    text,
    gate,
  });

/** Applies a fix the chat offers, or undoes one it applied (decision 038). */
export const applyFix = (slug: string, id: string, undo: boolean) =>
  postJson(
    ChatMessageSchema,
    `/api/projects/${encodeURIComponent(slug)}/fixes/${encodeURIComponent(id)}${undo ? "/undo" : ""}`,
    {},
  );

/** Reads edited Mermaid as the graph, without saving it. */
export const readGraph = (slug: string, mermaid: string) =>
  postJson(GraphReadSchema, `/api/projects/${encodeURIComponent(slug)}/graph/read`, { mermaid });

/** Saves edited Mermaid as the project's graph. */
export const saveGraph = (slug: string, mermaid: string) =>
  fetchChecked(GraphSavedSchema, `/api/projects/${encodeURIComponent(slug)}/graph`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mermaid }),
  });

/** Saves the style gate's changes, logo files and all, as MCP's set_style does. */
export const saveStyle = (slug: string, edit: StyleEdit) =>
  fetchChecked(StyleSavedSchema, `/api/projects/${encodeURIComponent(slug)}/style`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(edit),
  });

/** Saves the project's story brief, replacing the one before. */
export const saveBrief = (slug: string, brief: Brief) =>
  fetchChecked(BriefSavedSchema, `/api/projects/${encodeURIComponent(slug)}/brief`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(brief),
  });

/** The project's context: the files the assistant reads, and how much of the limit they use. */
export const getContext = (slug: string) =>
  fetchChecked(ContextListSchema, `/api/projects/${encodeURIComponent(slug)}/context`);

/** Adds a file of context, from an upload or a paste. */
export const addContextFile = (slug: string, file: AddContext) =>
  postJson(ContextFileSchema, `/api/projects/${encodeURIComponent(slug)}/context`, file);

export const removeContextFile = (slug: string, name: string) =>
  fetchChecked(
    ContextListSchema,
    `/api/projects/${encodeURIComponent(slug)}/context/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );

/** Saves the script from the Script gate's editor. */
export const saveStoryboard = (slug: string, storyboard: Storyboard) =>
  fetchChecked(StoryboardSavedSchema, `/api/projects/${encodeURIComponent(slug)}/storyboard`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(storyboard),
  });

/** The measured length of each line already spoken, by its words. */
export const getMeasuredLines = (slug: string) =>
  fetchChecked(MeasuredLinesSchema, `/api/projects/${encodeURIComponent(slug)}/narration`);

/** The house rules every project's story follows. */
export const getHouseRules = () => fetchChecked(HouseRulesBodySchema, "/api/house-rules");

export const saveHouseRules = (text: string) =>
  fetchChecked(HouseRulesBodySchema, "/api/house-rules", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

/** The saved logo as data URLs, for the preview, or null without one. */
export const getLogo = (slug: string) =>
  fetchChecked(SavedLogoSchema, `/api/projects/${encodeURIComponent(slug)}/logo`);

/** Starts making the preview's sound (the voice, then the mix), or says how far it is. */
export const startPreviewSound = (slug: string) =>
  postJson(PreviewSoundSchema, `/api/projects/${encodeURIComponent(slug)}/preview-sound`, {});

/** How far the preview's sound is. */
export const getPreviewSound = (slug: string) =>
  fetchChecked(PreviewSoundSchema, `/api/projects/${encodeURIComponent(slug)}/preview-sound`);

/** Where the ready soundtrack is served; its key changes whenever the sound does. */
export const previewSoundUrl = (slug: string, key: string) =>
  `/api/projects/${encodeURIComponent(slug)}/preview-sound/${key}.wav`;

/** Runs the checks from the Preview gate; they wait for the sound first. */
export const startChecks = (slug: string) =>
  postJson(ChecksRunSchema, `/api/projects/${encodeURIComponent(slug)}/checks`, {});

/** The run of the checks under way, the last report, and whether the files are still the ones it checked. */
export const getChecks = (slug: string) =>
  fetchChecked(PreviewChecksSchema, `/api/projects/${encodeURIComponent(slug)}/checks`);

/**
 * Where the contact sheet is served: full size (PNG) or small (JPEG). Each
 * run draws it again under the same name, so the report's time tells them apart.
 */
export const contactSheetUrl = (slug: string, file: string, checkedAt: string) =>
  `/api/projects/${encodeURIComponent(slug)}/checks/${encodeURIComponent(file)}?v=${encodeURIComponent(checkedAt)}`;

/** The project's render jobs and its finished renders. */
export const getRenders = (slug: string) =>
  fetchChecked(RendersViewSchema, `/api/projects/${encodeURIComponent(slug)}/renders`);

/** Queues a render; the theme and resolution left out are the style's. */
export const startRender = (slug: string, ask: RenderAsk) =>
  postJson(RenderJobSchema, `/api/projects/${encodeURIComponent(slug)}/renders`, ask);

export const cancelRender = (slug: string, job: string) =>
  postJson(
    RenderJobSchema,
    `/api/projects/${encodeURIComponent(slug)}/renders/${encodeURIComponent(job)}/cancel`,
    {},
  );

/** Where a finished render's file is served; as a download when asked. */
export const renderFileUrl = (
  slug: string,
  { stamp, theme, name }: { stamp: string; theme: string; name: string },
  download = false,
) =>
  `/api/projects/${[slug, "renders", stamp, theme, name].map(encodeURIComponent).join("/")}${download ? "?download=1" : ""}`;

export const approveGate = (slug: string, gate: Gate) =>
  postJson(ApprovedSchema, `/api/projects/${encodeURIComponent(slug)}/approve`, { gate });

export const getSettings = (): Promise<Validated<SettingsView>> =>
  fetchChecked(SettingsViewSchema, "/api/settings");

export const saveSettings = (update: SettingsUpdate): Promise<Validated<SettingsView>> =>
  fetchChecked(SettingsViewSchema, "/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });

/**
 * Listens to the server's events; the returned function stops listening.
 * `connected` runs each time the stream opens or reopens after the server
 * restarts, since events sent while it was down are lost. Unknown events are
 * ignored.
 */
export const onServerEvents = ({
  connected,
  event: listener,
}: {
  readonly connected: () => void;
  readonly event: (event: ServerEvent) => void;
}): (() => void) => {
  const source = new EventSource("/api/events");
  source.addEventListener("ready", connected);
  const handle = (message: MessageEvent<string>) => {
    try {
      const event = ServerEventSchema.safeParse(JSON.parse(message.data));
      if (event.success) listener(event.data);
    } catch {
      // A message that is not JSON is not one of ours.
    }
  };
  for (const type of ServerEventSchema.options.map((o) => o.shape.type.value))
    source.addEventListener(type, handle);
  return () => source.close();
};
