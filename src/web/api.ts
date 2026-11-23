import type { z } from "zod";
import {
  ApprovedSchema,
  CreatedProjectSchema,
  ErrorsResponseSchema,
  GraphReadSchema,
  GraphSavedSchema,
  type OpenedProject,
  OpenedProjectSchema,
  type ProjectList,
  ProjectListSchema,
  type ServerEvent,
  ServerEventSchema,
} from "../schema/api.ts";
import { type Chat, ChatSchema } from "../schema/chat.ts";
import { parseWith, type Validated } from "../schema/errors.ts";
import type { Gate } from "../schema/project.ts";
import { fail } from "../schema/result.ts";
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
  if (!response.ok) {
    const errors = ErrorsResponseSchema.safeParse(body);
    return fail(
      errors.success
        ? errors.data.errors
        : [{ path: "(response)", message: `status ${response.status}` }],
    );
  }
  return parseWith(schema, body);
};

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
