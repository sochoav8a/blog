// CLI del generador imagen→ASCII de los rieles.
//
//   pnpm ascii <imagen> [opciones]
//
//   --mode, -m    ramp | edges          (default: ramp)
//   --width, -w   columnas de texto     (default: 44)
//   --invert      voltea claros/oscuros (fotos sobre fondo oscuro)
//   --dark <n>    ramp: luminancia 0–255 bajo la que una celda va en tinta
//   --edge <n>    edges: percentil 0–100 desde el que un gradiente es trazo
//   --gamma <g>   abre (g>1) o cierra (g<1) las sombras; útil en fotos oscuras
//   --keep-levels no estirar el contraste al rango completo
//   --format      html | txt            (default: html, duotono)
//   --out, -o     ruta de salida        (default: src/ascii/art/<nombre>.html)
//
// Acepta lo que sharp decodifique (png, jpg, webp, gif…) y svg vía resvg.
// Imprime siempre una previsualización en la terminal; el archivo escrito
// es el fragmento que consumen src/ascii/rails.ts y AsciiRail.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import {
  applyGamma,
  convert,
  renderHtml,
  renderText,
  rowsFor,
  type Grid,
  type Mode,
} from './convert.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mode: { type: 'string', short: 'm', default: 'ramp' },
    width: { type: 'string', short: 'w', default: '44' },
    invert: { type: 'boolean', default: false },
    dark: { type: 'string' },
    edge: { type: 'string' },
    gamma: { type: 'string' },
    'keep-levels': { type: 'boolean', default: false },
    format: { type: 'string', default: 'html' },
    out: { type: 'string', short: 'o' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const USAGE = `uso: pnpm ascii <imagen> [--mode ramp|edges] [--width 44] [--invert]
                 [--dark 0-255] [--edge 0-100] [--gamma 0.2-5] [--keep-levels]
                 [--format html|txt] [--out ruta]`;

if (values.help || positionals.length !== 1) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

const input = positionals[0]!;
const mode = values.mode as Mode;
if (mode !== 'ramp' && mode !== 'edges') {
  console.error(`--mode debe ser ramp o edges (recibido: ${values.mode})`);
  process.exit(1);
}
const format = values.format;
if (format !== 'html' && format !== 'txt') {
  console.error(`--format debe ser html o txt (recibido: ${values.format})`);
  process.exit(1);
}
const cols = Number.parseInt(values.width, 10);
if (!Number.isFinite(cols) || cols < 4 || cols > 400) {
  console.error(`--width debe ser un entero entre 4 y 400 (recibido: ${values.width})`);
  process.exit(1);
}

/** SVG → PNG con resvg (dependencia ya presente); el resto lo decodifica sharp. */
async function loadImage(path: string): Promise<Buffer> {
  const raw = await readFile(path);
  if (extname(path).toLowerCase() !== '.svg') return raw;
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(raw.toString('utf8'), {
    // Sobra resolución para el muestreo por celda.
    fitTo: { mode: 'width', value: cols * 12 },
  });
  return Buffer.from(resvg.render().asPng());
}

const source = await loadImage(input);
const meta = await sharp(source).metadata();
if (!meta.width || !meta.height) {
  console.error(`no pude leer las dimensiones de ${input}`);
  process.exit(1);
}
const rows = rowsFor(meta.width, meta.height, cols);

let pipeline = sharp(source)
  .flatten({ background: '#ffffff' }) // transparencia = papel
  .resize(cols, rows, { fit: 'fill' })
  .grayscale();
if (!values['keep-levels']) pipeline = pipeline.normalise();
// Un suavizado leve estabiliza el sobel en rejillas tan pequeñas.
if (mode === 'edges') pipeline = pipeline.blur(0.6);

const { data } = await pipeline.raw().toBuffer({ resolveWithObject: true });
let grid: Grid = { width: cols, height: rows, data: new Uint8Array(data) };

if (values.gamma) {
  const gamma = Number.parseFloat(values.gamma);
  if (!Number.isFinite(gamma) || gamma < 0.2 || gamma > 5) {
    console.error(`--gamma debe estar entre 0.2 y 5 (recibido: ${values.gamma})`);
    process.exit(1);
  }
  grid = applyGamma(grid, gamma);
}

const cells = convert(grid, {
  mode,
  invert: values.invert,
  darkAt: values.dark ? Number.parseInt(values.dark, 10) : undefined,
  edgeAt: values.edge ? Number.parseInt(values.edge, 10) : undefined,
});

if (cells.length === 0) {
  console.error('la conversión quedó vacía: prueba otro --mode, --edge más bajo o --invert');
  process.exit(1);
}

const name = basename(input, extname(input));
const outPath = values.out ?? join('src/ascii/art', `${name}.${format}`);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, (format === 'html' ? renderHtml(cells) : renderText(cells)) + '\n');

console.log(renderText(cells));
console.log(
  `\n${outPath} · ${mode} · ${cells[0]?.length ?? 0}×${cells.length}` +
    (format === 'html' ? ' · duotono (spans .k)' : ''),
);
