/**
 * The Kokoro voices kokoro-js ships with (Kokoro-82M v1.0): American English
 * (`a`), then British English (`b`); female (`f`), then male (`m`). A test
 * in `src/audio/` checks this list against the package.
 */
export const VOICE_IDS = [
  "af_heart",
  "af_alloy",
  "af_aoede",
  "af_bella",
  "af_jessica",
  "af_kore",
  "af_nicole",
  "af_nova",
  "af_river",
  "af_sarah",
  "af_sky",
  "am_adam",
  "am_echo",
  "am_eric",
  "am_fenrir",
  "am_liam",
  "am_michael",
  "am_onyx",
  "am_puck",
  "am_santa",
  "bf_emma",
  "bf_isabella",
  "bf_alice",
  "bf_lily",
  "bm_george",
  "bm_lewis",
  "bm_daniel",
  "bm_fable",
] as const;

export type VoiceId = (typeof VOICE_IDS)[number];
