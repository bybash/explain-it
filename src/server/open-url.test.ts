import { describe, expect, it } from "vitest";
import { openUrl } from "./open-url.ts";

describe("openUrl", () => {
  it("gives this machine's address when the app listens on every address, as in Docker", () => {
    expect(openUrl("0.0.0.0", 3000)).toBe("http://127.0.0.1:3000");
    expect(openUrl("::", 3000)).toBe("http://127.0.0.1:3000");
  });

  it("gives the address it listens on otherwise, an IPv6 one in brackets", () => {
    expect(openUrl("127.0.0.1", 3100)).toBe("http://127.0.0.1:3100");
    expect(openUrl("localhost", 3000)).toBe("http://localhost:3000");
    expect(openUrl("::1", 3000)).toBe("http://[::1]:3000");
  });
});
