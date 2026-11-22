/** The rate everything is mixed and written at: the music, the mix and the videos' audio. */
export const AUDIO_RATE = 48_000;

export const dbToGain = (db: number): number => 10 ** (db / 20);

/** Below this a sample counts as silence. */
const SILENCE = 1e-3;

/**
 * The RMS of the samples that sound, leaving out silence, so a voice with
 * pauses or music with fades is measured by what you hear of it.
 */
export const soundingRms = (samples: Float32Array): number => {
  let sum = 0;
  let count = 0;
  for (const s of samples)
    if (Math.abs(s) > SILENCE) {
      sum += s * s;
      count++;
    }
  return Math.sqrt(sum / Math.max(1, count));
};
