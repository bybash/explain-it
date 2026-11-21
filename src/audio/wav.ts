import type { ValidationError } from "../schema/errors.ts";
import { fail, ok, type Result } from "../schema/result.ts";

/** Mono audio as the voice provider makes it: samples from -1 to 1. */
export type Audio = { readonly samples: Float32Array; readonly sampleRate: number };

const HEADER = 44;
const MAX_16 = 0x7fff;

/** Mono 16-bit PCM in a WAV file: what ffmpeg and every player read. */
export const encodeWav = ({ samples, sampleRate }: Audio): Uint8Array => {
  const bytes = new Uint8Array(HEADER + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    for (const [i, c] of [...value].entries()) view.setUint8(at + i, c.charCodeAt(0));
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // the fmt chunk's size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes a second
  view.setUint16(32, 2, true); // bytes a frame
  view.setUint16(34, 16, true); // bits a sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (const [i, sample] of samples.entries()) {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(HEADER + i * 2, Math.round(clipped * MAX_16), true);
  }
  return bytes;
};

export type DecodedWav = Audio & { readonly seconds: number };

const wrong = (where: string, message: string) => fail<ValidationError>([{ path: where, message }]);

/** Reads back a WAV that `encodeWav` wrote, with its length in seconds; errors name `where`, its file. */
export const decodeWav = (
  bytes: Uint8Array,
  where = "wav",
): Result<DecodedWav, ValidationError> => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number) => new TextDecoder().decode(bytes.subarray(at, at + 4));
  if (bytes.length < HEADER || text(0) !== "RIFF" || text(8) !== "WAVE")
    return wrong(where, "not a RIFF/WAVE file");
  if (
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint16(34, true) !== 16
  )
    return wrong(where, "expected 16-bit mono PCM");
  const sampleRate = view.getUint32(24, true);
  const count = Math.min(view.getUint32(40, true), bytes.length - HEADER) / 2;
  const samples = Float32Array.from(
    { length: count },
    (_, i) => view.getInt16(HEADER + i * 2, true) / MAX_16,
  );
  return ok({ samples, sampleRate, seconds: count / sampleRate });
};
