/** Colour arithmetic on `#rrggbb` strings, the form palettes are written in. */

type Rgb = readonly [number, number, number];
/** Hue in degrees, saturation and lightness 0..1. */
export type Hsl = { readonly h: number; readonly s: number; readonly l: number };

const rgbOf = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const hexOf = (rgb: Rgb): string =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** An sRGB channel, 0..255, as linear light. */
const linear = (channel: number): number => {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance, as WCAG 2 defines it. */
export const luminance = (hex: string): number => {
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

/** The WCAG 2 contrast ratio, 1 to 21. */
export const contrast = (a: string, b: string): number => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

export const hslOf = (hex: string): Hsl => {
  const [r, g, b] = rgbOf(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const chroma = max - min;
  if (chroma === 0) return { h: 0, s: 0, l };
  const s = chroma / (1 - Math.abs(2 * l - 1));
  const sector =
    max === r
      ? ((g - b) / chroma + 6) % 6
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  return { h: sector * 60, s, l };
};

export const hexOfHsl = ({ h, s, l }: Hsl): string => {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] = (
    [
      [chroma, x, 0],
      [x, chroma, 0],
      [0, chroma, x],
      [0, x, chroma],
      [x, 0, chroma],
      [chroma, 0, x],
    ] as const
  )[sector] ?? [0, 0, 0];
  return hexOf([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
};

/** `a` moved towards `b` by `amount`, 0 (all `a`) to 1 (all `b`), in sRGB. */
export const mix = (a: string, b: string, amount: number): string => {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  const towards = (from: number, to: number) => from + (to - from) * amount;
  return hexOf([towards(ar, br), towards(ag, bg), towards(ab, bb)]);
};
