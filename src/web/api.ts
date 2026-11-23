import type { z } from "zod";
import {
  ApprovedSchema,
  CreatedProjectSchema,
  ErrorsResponseSchema,
  GraphReadSchema,
  GraphSavedSchema,
  type OpenedProject,
  OpenedProjectSchema,
  PreviewSoundSchema,
  type ProjectList,
  ProjectListSchema,
  SavedLogoSchema,
  type ServerEvent,
  ServerEventSchema,
  type StyleEdit,
  StyleSavedSchema,
} from "../schema/api.ts";
import { type Chat, ChatSchema } from "../schema/chat.ts";
import type { Config, VoiceConfig } from "../schema/config.ts";
import { parseWith, type Validated, type ValidationError } from "../schema/errors.ts";
import type { Gate } from "../schema/project.ts";
import { fail, ok } from "../schema/result.ts";
import { type SettingsUpdate, type SettingsView, SettingsViewSchema } from "../schema/settings.ts";

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
