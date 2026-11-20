import { describe, expect, it } from "vitest";
import { captureInOrder } from "./parallel.ts";

/** Resolves after `ms` of real time, so captures finish out of order. */
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("captureInOrder", () => {
  it("writes every frame once, in order, whatever order the captures finish in", async () => {
    const written: number[] = [];
    await captureInOrder({
      count: 23,
      workers: 4,
      ahead: 8,
      capture: async (_worker, i) => {
        await delay((i * 7) % 5);
        return i;
      },
      write: async (frame) => {
        await delay(1);
        written.push(frame);
      },
    });
    expect(written).toEqual(Array.from({ length: 23 }, (_, i) => i));
  });

  it("never captures more than `ahead` frames past the next one to write", async () => {
    let written = 0;
    let furthest = 0;
    await captureInOrder({
      count: 40,
      workers: 4,
      ahead: 6,
      // Frame 0 is slow, so the other workers would race ahead without a bound.
      capture: async (_worker, i) => {
        furthest = Math.max(furthest, i - written);
        await delay(i === 0 ? 30 : 0);
        return i;
      },
      write: async () => {
        written += 1;
      },
    });
    expect(written).toBe(40);
    expect(furthest).toBeLessThan(6);
  });

  it("fails with the first error once every running capture has stopped, and starts no more", async () => {
    let started = 0;
    let running = 0;
    const result = captureInOrder({
      count: 100,
      workers: 4,
      ahead: 8,
      capture: async (_worker, i) => {
        started += 1;
        running += 1;
        await delay(i === 5 ? 2 : 10);
        running -= 1;
        if (i === 5) throw new Error("page crashed at frame 5");
        return i;
      },
      write: async () => {},
    });
    await expect(result).rejects.toThrow("page crashed at frame 5");
    expect(running).toBe(0);
    const startedWhenFailed = started;
    await delay(30);
    expect(started).toBe(startedWhenFailed);
    expect(started).toBeLessThan(100);
  });

  it("fails when a write fails", async () => {
    await expect(
      captureInOrder({
        count: 20,
        workers: 4,
        ahead: 8,
        capture: async (_worker, i) => i,
        write: async (frame) => {
          if (frame === 3) throw new Error("ffmpeg closed its input");
        },
      }),
    ).rejects.toThrow("ffmpeg closed its input");
  });
});
