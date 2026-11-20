export interface Tile {
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Cut an image into a rows × cols grid. Edges are distributed so every pixel
 * lands in exactly one tile (no gaps, no overlap). With `square`, the grid is
 * centered and cropped so each tile is square (for carousel posts).
 */
export function gridTiles(width: number, height: number, rows: number, cols: number, square = false): Tile[] {
  rows = Math.max(1, Math.floor(rows));
  cols = Math.max(1, Math.floor(cols));
  let ox = 0;
  let oy = 0;
  let W = width;
  let H = height;
  if (square) {
    const side = Math.floor(Math.min(width / cols, height / rows));
    W = side * cols;
    H = side * rows;
    ox = Math.floor((width - W) / 2);
    oy = Math.floor((height - H) / 2);
  }
  const xs = Array.from({ length: cols + 1 }, (_, i) => ox + Math.round((W * i) / cols));
  const ys = Array.from({ length: rows + 1 }, (_, i) => oy + Math.round((H * i) / rows));
  const out: Tile[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ row: r, col: c, x: xs[c], y: ys[r], w: xs[c + 1] - xs[c], h: ys[r + 1] - ys[r] });
  return out;
}
