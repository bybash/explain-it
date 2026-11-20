import qrcode from "qrcode-generator";

/**
 * A link as a QR code's modules, row by row; `true` is dark. The version is
 * the smallest that fits, with error correction level M (15% damage), which
 * keeps a 200-character link small enough to scan off a screen.
 */
export const qrModules = (text: string): boolean[][] => {
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => code.isDark(row, col)),
  );
};

/**
 * An SVG path that fills the dark modules, one unit per module, as one
 * rectangle per run of dark modules in a row. Drawn in a viewBox the size
 * of the code, plus its quiet zone.
 */
export const qrPath = (modules: readonly (readonly boolean[])[]): string => {
  const runs: string[] = [];
  for (const [y, row] of modules.entries()) {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (row[x]) x += 1;
      const length = x - start;
      runs.push(`M${start} ${y}h${length}v1h-${length}z`);
    }
  }
  return runs.join("");
};
