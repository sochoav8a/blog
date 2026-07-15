// Conversión pura imagen→ASCII para los rieles del blog.
// Sin IO: recibe una rejilla de luminancias (0–255, ya redimensionada a
// columnas×filas de caracteres) y devuelve texto o un fragmento HTML.
// La decodificación de imágenes y la escritura de archivos viven en cli.ts.

/** Rejilla de luminancias: data[y * width + x] ∈ [0, 255], 0 = negro. */
export interface Grid {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Celda ya convertida. `dark` marca los trazos que van en tinta (duotono). */
export interface Cell {
  char: string;
  dark: boolean;
}

export type Mode = 'ramp' | 'edges';

export interface ConvertOptions {
  mode?: Mode;
  /** Invierte la luminancia (para fotos sobre fondo oscuro). */
  invert?: boolean;
  /** ramp: luminancia bajo la cual la celda va en tinta. */
  darkAt?: number;
  /** edges: percentil de magnitud (0–100) desde el que un gradiente es trazo. */
  edgeAt?: number;
}

/**
 * Proporción ancho/alto de una celda de texto en los rieles:
 * Courier Prime avanza 0.6 em y .rail-art usa line-height 1.3.
 */
export const CHAR_ASPECT = 0.6 / 1.3;

/** Filas de caracteres que corresponden a `cols` manteniendo la proporción. */
export function rowsFor(imgWidth: number, imgHeight: number, cols: number): number {
  return Math.max(1, Math.round((imgHeight / imgWidth) * cols * CHAR_ASPECT));
}

/** Claro→oscuro; el papel es claro, así que la tinta densa cae en lo oscuro. */
const RAMP = ' .:-=+*#%@';

const DEFAULTS = { darkAt: 88, edgeAt: 84 };

export function convert(grid: Grid, options: ConvertOptions = {}): Cell[][] {
  const mode = options.mode ?? 'ramp';
  const cells = mode === 'edges' ? edgesConvert(grid, options) : rampConvert(grid, options);
  return crop(cells);
}

function luminanceAt(grid: Grid, x: number, y: number, invert: boolean): number {
  const raw = grid.data[y * grid.width + x] ?? 255;
  return invert ? 255 - raw : raw;
}

function rampConvert(grid: Grid, options: ConvertOptions): Cell[][] {
  const invert = options.invert ?? false;
  const darkAt = options.darkAt ?? DEFAULTS.darkAt;
  const rows: Cell[][] = [];
  for (let y = 0; y < grid.height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < grid.width; x++) {
      const lum = luminanceAt(grid, x, y, invert);
      const index = Math.min(RAMP.length - 1, Math.floor(((255 - lum) / 256) * RAMP.length));
      row.push({ char: RAMP[index] ?? ' ', dark: lum < darkAt });
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Sobel por celda. El carácter sigue la dirección del borde (perpendicular
 * al gradiente): gradiente horizontal → borde vertical `|`, etc.
 */
function edgesConvert(grid: Grid, options: ConvertOptions): Cell[][] {
  const invert = options.invert ?? false;
  const edgeAt = options.edgeAt ?? DEFAULTS.edgeAt;
  const { width, height } = grid;

  const gx = new Float64Array(width * height);
  const gy = new Float64Array(width * height);
  const mags: number[] = [];
  const lum = (x: number, y: number) =>
    luminanceAt(grid, Math.min(width - 1, Math.max(0, x)), Math.min(height - 1, Math.max(0, y)), invert);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx =
        -lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1) +
        lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1);
      const sy =
        -lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1) +
        lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1);
      const i = y * width + x;
      gx[i] = sx;
      gy[i] = sy;
      const mag = Math.hypot(sx, sy);
      if (mag > 0) mags.push(mag);
    }
  }

  const cut = Math.max(60, percentile(mags, edgeAt));
  const strong = percentile(mags, Math.min(99, edgeAt + 12));

  const rows: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const mag = Math.hypot(gx[i] ?? 0, gy[i] ?? 0);
      if (mag < cut) {
        row.push({ char: ' ', dark: false });
        continue;
      }
      row.push({ char: edgeChar(gx[i] ?? 0, gy[i] ?? 0), dark: mag >= strong });
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Dirección del gradiente en [0, 180) → carácter del borde perpendicular.
 * En coordenadas de imagen (y hacia abajo): gradiente ↘ (45°) implica un
 * borde que sube hacia la derecha en pantalla, es decir `/`.
 */
function edgeChar(gx: number, gy: number): string {
  let angle = (Math.atan2(gy, gx) * 180) / Math.PI;
  if (angle < 0) angle += 180;
  if (angle < 22.5 || angle >= 157.5) return '|'; // gradiente horizontal
  if (angle < 67.5) return '/';
  if (angle < 112.5) return '-'; // gradiente vertical
  return '\\';
}

/**
 * Corrección gamma sobre la rejilla: g > 1 abre las sombras (fotos oscuras),
 * g < 1 las cierra. Pensada para aplicarse antes de convertir.
 */
export function applyGamma(grid: Grid, gamma: number): Grid {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    table[i] = Math.round(255 * Math.pow(i / 255, 1 / gamma));
  }
  const data = new Uint8Array(grid.data.length);
  for (let i = 0; i < grid.data.length; i++) data[i] = table[grid.data[i] ?? 0] ?? 0;
  return { width: grid.width, height: grid.height, data };
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[index] ?? 0;
}

/** Recorta filas y columnas vacías en los bordes: el arte queda al hueso. */
export function crop(cells: Cell[][]): Cell[][] {
  const blankRow = (row: Cell[]) => row.every((cell) => cell.char === ' ');
  let top = 0;
  let bottom = cells.length;
  while (top < bottom && blankRow(cells[top] ?? [])) top++;
  while (bottom > top && blankRow(cells[bottom - 1] ?? [])) bottom--;
  const rows = cells.slice(top, bottom);
  if (rows.length === 0) return [];

  const width = Math.max(...rows.map((row) => row.length));
  const blankCol = (x: number) => rows.every((row) => (row[x]?.char ?? ' ') === ' ');
  let left = 0;
  let right = width;
  while (left < right && blankCol(left)) left++;
  while (right > left && blankCol(right - 1)) right--;
  return rows.map((row) => row.slice(left, right));
}

/** Texto plano: para previsualizar en terminal o salida --format txt. */
export function renderText(cells: Cell[][]): string {
  return cells.map((row) => row.map((cell) => cell.char).join('').replace(/ +$/, '')).join('\n');
}

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Fragmento HTML duotono: el color base lo pone .rail-art (verde línea) y las
 * rachas oscuras van envueltas en <span class="k"> (tinta). Todo escapado.
 */
export function renderHtml(cells: Cell[][]): string {
  const lines = cells.map((row) => {
    let html = '';
    let run = '';
    let runDark = false;
    const flush = () => {
      if (run === '') return;
      html += runDark ? `<span class="k">${escapeHtml(run)}</span>` : escapeHtml(run);
      run = '';
    };
    for (const cell of row) {
      const dark = cell.dark && cell.char !== ' ';
      if (dark !== runDark) {
        flush();
        runDark = dark;
      }
      run += cell.char;
    }
    flush();
    return html.replace(/ +$/, '');
  });
  return lines.join('\n');
}
