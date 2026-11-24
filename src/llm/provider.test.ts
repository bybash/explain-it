import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { formatErrors } from "../schema/errors.ts";
import type { LlmRequest } from "./client.ts";
import { type ProviderSettings, providerClient } from "./provider.ts";

/** A request the stub received: its path, headers and JSON body. */
type Received = { path: string; auth: string | undefined; body: Record<string, unknown> };

/** An OpenAI-compatible endpoint on a port of the system's choosing, answering as `answer` says. */
const stub = async (answer: (received: Received) => { status: number; body: unknown }) => {
  const received: Received[] = [];
  const server: Server = createServer(async (req: IncomingMessage, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const got = {
      path: req.url ?? "",
      auth: req.headers.authorization,
      body: JSON.parse(text || "{}"),
    };
    received.push(got);
    const { status, body } = answer(got);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}/v1`, received };
};
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))));
});

/** A chat completion whose message is `content`, as OpenAI's API answers. */
const completion = (content: string) => ({
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 1_764_000_000,
  model: "some/model",
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
});

const REQUEST: LlmRequest = {
  name: "greeting",
  system: "Answer with JSON only.",
  messages: [{ role: "user", content: "Say hello." }],
  schema: {
    type: "object",
    properties: { greeting: { type: "string" } },
    required: ["greeting"],
    additionalProperties: false,
  },
};

const client = (settings: Partial<ProviderSettings> & { baseUrl: string }) =>
  providerClient({
    settings: async () => ({ model: "some/model", apiKey: "sk-test-123", ...settings }),
    maxRetries: 0,
  });

describe("providerClient", () => {
  it("asks the endpoint for JSON in the request's schema, with the key and the model, and gives back the text", async () => {
    const { baseUrl, received } = await stub(() => ({
      status: 200,
      body: completion('{"greeting":"Hello"}'),
    }));
    const reply = await client({ baseUrl }).generate(REQUEST);
    expect(reply).toEqual({ ok: true, value: { text: '{"greeting":"Hello"}' } });
    const [sent] = received;
    expect(sent?.path).toBe("/v1/chat/completions");
    expect(sent?.auth).toBe("Bearer sk-test-123");
    expect(sent?.body.model).toBe("some/model");
    expect(sent?.body.messages).toEqual([
      { role: "system", content: "Answer with JSON only." },
      { role: "user", content: "Say hello." },
    ]);
    expect(JSON.stringify(sent?.body.response_format)).toContain('"greeting"');
  });

  it("gives back a reply that is not JSON as it is, for the repair loop to answer", async () => {
    const { baseUrl } = await stub(() => ({ status: 200, body: completion("Hello there!") }));
    expect(await client({ baseUrl }).generate(REQUEST)).toEqual({
      ok: true,
      value: { text: "Hello there!" },
    });
  });

  it("says plainly when the key is refused, the model is unknown, or the host cannot be reached", async () => {
    const refused = await stub(() => ({ status: 401, body: { error: { message: "No auth" } } }));
    const unknown = await stub(() => ({ status: 404, body: { error: { message: "Not found" } } }));
    const messages = async (settings: Parameters<typeof client>[0]) => {
      const reply = await client(settings).generate(REQUEST);
      return reply.ok ? [] : formatErrors(reply.errors);
    };
    expect(await messages({ baseUrl: refused.baseUrl })).toEqual([
      "llm: the key was refused by 127.0.0.1; check it in Settings",
    ]);
    expect((await messages({ baseUrl: unknown.baseUrl, model: "no/such" }))[0]).toMatch(
      /^llm: 127\.0\.0\.1 has no model "no\/such"/,
    );
    // A port nothing listens on: its server is closed again before the call.
    const closed = await stub(() => ({ status: 200, body: {} }));
    await new Promise((done) => servers.pop()?.close(done));
    expect(await messages({ baseUrl: closed.baseUrl })).toEqual([
      "llm: could not reach 127.0.0.1; is the base URL right, and is it running?",
    ]);
  });

  it("needs a key for an endpoint on the network, but not for one on this machine", async () => {
    const { baseUrl, received } = await stub(() => ({
      status: 200,
      body: completion('{"greeting":"Hi"}'),
    }));
    const local = await client({ baseUrl, apiKey: undefined }).generate(REQUEST);
    expect(local.ok).toBe(true);
    expect(received[0]?.auth).toBeUndefined();
    const remote = await providerClient({
      settings: async () => ({ baseUrl: "https://openrouter.ai/api/v1", model: "some/model" }),
      maxRetries: 0,
    }).generate(REQUEST);
    expect(remote.ok ? [] : formatErrors(remote.errors)).toEqual([
      "llm: no API key for openrouter.ai; add one in Settings",
    ]);
  });
});
