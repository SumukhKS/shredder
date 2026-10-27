export type Rect = { x: number; y: number; w: number; h: number };

/** Packs items into rows: half-span items sit two to a row, full-span items take a row each. */
export function packRows(keys: string[], spans: Record<string, number>, heights: Record<string, number>, width: number, gap: number) {
  const out: Record<string, Rect> = {};
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const k of keys) {
    const half = (spans[k] ?? 1) < 1;
    const w = half ? (width - gap) / 2 : width;
    const h = heights[k] ?? 0;
    if (x > 0 && (!half || x + w > width + 0.5)) {
      y += rowH + gap;
      x = 0;
      rowH = 0;
    }
    out[k] = { x, y, w, h };
    rowH = Math.max(rowH, h);
    x = half ? x + w + gap : width + 1;
  }
  return { rects: out, height: keys.length ? y + rowH : 0 };
}
