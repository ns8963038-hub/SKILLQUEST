// WHERE THE TEXT CURSOR IS, ON SCREEN
//
// The sign-in screen's Nova reads along as you type: its eyes follow the text
// cursor of the field you're in. That needs the cursor's position in viewport
// pixels: the input's left edge + its padding + the width of the text before
// the cursor, less however far a long value has scrolled, kept inside the box.
//
// Email inputs don't expose the cursor (selectionStart is null there), so it is
// taken to be at the end of what's typed — which is exactly where it is while
// someone is typing.

export type TextMeasurer = (text: string, font: string) => number;

// The text's width in the input's own font, measured on a hidden canvas.
let canvasContext: CanvasRenderingContext2D | null | undefined;
export const measureText: TextMeasurer = (text, font) => {
  if (canvasContext === undefined) {
    try {
      canvasContext = document.createElement('canvas').getContext('2d');
    } catch {
      canvasContext = null;
    }
  }
  if (!canvasContext) return text.length * 8; // no canvas available: a fair average
  canvasContext.font = font;
  return canvasContext.measureText(text).width;
};

export function caretPoint(input: HTMLInputElement, measure: TextMeasurer = measureText): { x: number; y: number } {
  const box = input.getBoundingClientRect();
  const style = window.getComputedStyle(input);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padRight = parseFloat(style.paddingRight) || 0;
  // Built from its parts: some browsers leave the `font` shorthand empty.
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

  let end = input.value.length;
  try {
    if (typeof input.selectionStart === 'number') end = input.selectionStart;
  } catch {
    /* some input types refuse to report a selection: keep the end */
  }

  const textWidth = measure(input.value.slice(0, end), font);
  const x = box.left + padLeft + textWidth - input.scrollLeft;
  return {
    x: Math.max(box.left + padLeft, Math.min(x, box.right - padRight)),
    y: box.top + box.height / 2,
  };
}
