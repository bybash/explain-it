import { describe, expect, it } from "vitest";
import { logoShowsOn } from "./show.ts";

describe("logoShowsOn", () => {
  it("draws the logo on the cards that `show` names, or on every frame", () => {
    const where = (show: Parameters<typeof logoShowsOn>[0]) =>
      (["title", "end", "frames"] as const).filter((place) => logoShowsOn(show, place));
    expect(where("start")).toEqual(["title"]);
    expect(where("end")).toEqual(["end"]);
    expect(where("both")).toEqual(["title", "end"]);
    expect(where("all")).toEqual(["frames"]);
  });
});
