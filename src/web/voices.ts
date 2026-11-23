import { VOICE_IDS, type VoiceId } from "../schema/voices.ts";
import { capitalised } from "./labels.ts";

const ACCENTS = { a: "American English", b: "British English" } as const;
const GENDERS = { f: "female", m: "male" } as const;

export type VoiceGroup = {
  readonly label: string;
  readonly voices: readonly { readonly id: VoiceId; readonly name: string }[];
};

/**
 * The voices for a picker, grouped as Kokoro names them: the id's first
 * letter is the accent, its second the voice (`bm_george` is a British male
 * voice called George), in the order VOICE_IDS lists them.
 */
export const voiceGroups = (): VoiceGroup[] => {
  const groups = new Map<string, { id: VoiceId; name: string }[]>();
  for (const id of VOICE_IDS) {
    const accent = ACCENTS[id[0] as keyof typeof ACCENTS];
    const gender = GENDERS[id[1] as keyof typeof GENDERS];
    const label = `${accent}, ${gender}`;
    const name = id.slice(3);
    const voices = groups.get(label) ?? [];
    voices.push({ id, name: capitalised(name) });
    groups.set(label, voices);
  }
  return [...groups].map(([label, voices]) => ({ label, voices }));
};
