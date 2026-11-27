/**
 * How many lines `text` takes at `width`, wrapped between words as the page
 * wraps it: a word too long for a line takes a line of its own. `measure`
 * gives a string's width in the font it is drawn in (a canvas in the page).
 */
export const wrappedLines = (
  text: string,
  width: number,
  measure: (text: string) => number,
): number => {
  const words = text.split(/\s+/).filter((word) => word !== "");
  let lines = 0;
  let line = "";
  for (const word of words) {
    const tried = line === "" ? word : `${line} ${word}`;
    if (line !== "" && measure(tried) > width) {
      lines++;
      line = word;
    } else line = tried;
  }
  return line === "" ? lines : lines + 1;
};
