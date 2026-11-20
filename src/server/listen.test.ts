import { describe, expect, it } from "vitest";
import { listenOptions } from "./listen.ts";

describe("listenOptions", () => {
  it("listens on 127.0.0.1:3000 by default, so nothing outside the machine can connect", () => {
    expect(listenOptions({})).toEqual({ ok: true, value: { hostname: "127.0.0.1", port: 3000 } });
  });

  it("takes HOST and PORT from the environment", () => {
    expect(listenOptions({ HOST: "0.0.0.0", PORT: "8080" })).toEqual({
      ok: true,
      value: { hostname: "0.0.0.0", port: 8080 },
    });
  });

  it("names a bad PORT", () => {
    for (const PORT of ["0", "70000", "abc", "30.5", ""])
      expect(listenOptions({ PORT })).toEqual({
        ok: false,
        errors: [{ path: "PORT", message: `"${PORT}" is not a port number from 1 to 65535` }],
      });
  });
});
