import { describe, expect, it } from "vitest";
import { decodeWav, encodeWav } from "./wav.ts";

describe("encodeWav and decodeWav", () => {
  it("writes 16-bit mono PCM that reads back with its rate and length", () => {
    const samples = Float32Array.from({ length: 24_000 * 1.5 }, (_, i) => Math.sin(i / 10) * 0.5);
    const wav = encodeWav({ samples, sampleRate: 24_000 });
    // A 44-byte header, then two bytes a sample.
    expect(wav.length).toBe(44 + samples.length * 2);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe("WAVE");
    const read = decodeWav(wav);
    expect(read.ok && read.value.sampleRate).toBe(24_000);
    expect(read.ok && read.value.seconds).toBe(1.5);
    expect(read.ok && read.value.samples.length).toBe(samples.length);
    // 16-bit loses a little precision, no more.
    const back = read.ok ? read.value.samples : new Float32Array();
    expect(Math.max(...back.map((s, i) => Math.abs(s - (samples[i] ?? 0))))).toBeLessThan(
      1 / 16_000,
    );
  });

  it("clips samples outside -1 to 1 instead of wrapping them", () => {
    const read = decodeWav(encodeWav({ samples: Float32Array.of(2, -2), sampleRate: 8_000 }));
    expect(read.ok && [...read.value.samples].map((s) => Math.round(s))).toEqual([1, -1]);
  });

  it("names what is wrong with a file that is not one it wrote", () => {
    expect(decodeWav(new Uint8Array(10))).toEqual({
      ok: false,
      errors: [{ path: "wav", message: "not a RIFF/WAVE file" }],
    });
    const stereo = encodeWav({ samples: Float32Array.of(0, 0), sampleRate: 8_000 });
    new DataView(stereo.buffer).setUint16(22, 2, true);
    expect(decodeWav(stereo)).toEqual({
      ok: false,
      errors: [{ path: "wav", message: "expected 16-bit mono PCM" }],
    });
  });
});
