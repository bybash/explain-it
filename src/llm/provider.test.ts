import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { formatErrors } from "../schema/errors.ts";
import type { LlmRequest } from "./client.ts";
import { type ProviderSettings, providerClient } from "./provider.ts";

/** A request the stub received: its path, headers and JSON body. */
type Received = {
  path: string;
  auth: string | undefined;
  apiKey: string | undefined;
  body: Record<string, unknown>;
};

/** An OpenAI-compatible endpoint on a port of the system's choosing, answering as `answer` says. */
const stub = async (answer: (received: Received) => { status: number; body: unknown }) => {
  const received: Received[] = [];
  const server: Server = createServer(async (req: IncomingMessage, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const got = {
      path: req.url ?? "",
      auth: req.headers.authorization,
      apiKey: req.headers["x-api-key"] as string | undefined,
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
    // Not strict: our schemas have optional fields, and the repair loop checks the shape.
    expect(sent?.body.response_format).toMatchObject({ json_schema: { strict: false } });
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

  it("says plainly when the account has no credit or the endpoint is limiting calls", async () => {
    const broke = await stub(() => ({ status: 402, body: { error: { message: "Payment" } } }));
    const busy = await stub(() => ({ status: 429, body: { error: { message: "Slow down" } } }));
    const first = async (baseUrl: string) => {
      const reply = await client({ baseUrl }).generate(REQUEST);
      return reply.ok ? "" : (formatErrors(reply.errors)[0] ?? "");
    };
    expect(await first(broke.baseUrl)).toBe(
      "llm: 127.0.0.1 refused the call for payment; check the account's credit",
    );
    expect(await first(busy.baseUrl)).toBe(
      "llm: 127.0.0.1 is limiting calls; wait a moment and try again",
    );
  });

  it("never repeats the key, even when the endpoint's own error does", async () => {
    const { baseUrl } = await stub(() => ({
      status: 400,
      body: { error: { message: "Bad request for key sk-test-123" } },
    }));
    const reply = await client({ baseUrl }).generate(REQUEST);
    const said = reply.ok ? "" : formatErrors(reply.errors).join("\n");
    expect(said).toMatch(/^llm: 127\.0\.0\.1 answered 400/);
    expect(said).not.toContain("sk-test-123");
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

/** A reply from Claude's Messages API whose text is `text`. */
const message = (text: string) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 12, output_tokens: 5 },
});

describe("providerClient with Anthropic's API", () => {
  /** The stub stands in for api.anthropic.com, whose base URL picks Claude's own API. */
  const anthropic = (baseUrl: string) =>
    providerClient({
      settings: async () => ({ baseUrl, model: "claude-opus-5-5", apiKey: "sk-ant-test-123" }),
      maxRetries: 0,
      anthropicHosts: ["127.0.0.1"],
    });

  it("asks Claude's Messages API, with the key in its own header and room for thinking", async () => {
    const { baseUrl, received } = await stub(() => ({
      status: 200,
      body: message('{"greeting":"Hello"}'),
    }));
    expect(await anthropic(baseUrl).generate(REQUEST)).toEqual({
      ok: true,
      value: { text: '{"greeting":"Hello"}' },
    });
    const [sent] = received;
    expect(sent?.path).toBe("/v1/messages");
    expect(sent?.auth).toBeUndefined();
    expect(sent?.apiKey).toBe("sk-ant-test-123");
    expect(sent?.body).toMatchObject({
      model: "claude-opus-5-5",
      system: [{ text: "Answer with JSON only." }],
    });
    expect(sent?.body.max_tokens).toBeGreaterThanOrEqual(16_000);
    expect(JSON.stringify(sent?.body)).toContain('"greeting"');
  });

  it("names a refused key plainly", async () => {
    const { baseUrl } = await stub(() => ({
      status: 401,
      body: {
        type: "error",
        error: { type: "authentication_error", message: "invalid x-api-key" },
      },
    }));
    const reply = await anthropic(baseUrl).generate(REQUEST);
    expect(reply.ok ? [] : formatErrors(reply.errors)).toEqual([
      "llm: the key was refused by 127.0.0.1; check it in Settings",
    ]);
  });
});
