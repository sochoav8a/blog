import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyGamma,
  convert,
  crop,
  escapeHtml,
  percentile,
  renderHtml,
  renderText,
  rowsFor,
  type Cell,
  type Grid,
} from './convert.ts';

/** Rejilla desde filas de luminancias, para casos sintéticos legibles. */
function grid(rows: number[][]): Grid {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => row.forEach((lum, x) => (data[y * width + x] = lum)));
  return { width, height, data };
}

function cells(text: string[], dark = false): Cell[][] {
  return text.map((row) => [...row].map((char) => ({ char, dark })));
}

describe('rowsFor', () => {
  it('compensa que una celda de texto es más alta que ancha', () => {
    // Imagen cuadrada: menos filas que columnas (0.6 / 1.3 ≈ 0.46).
    assert.equal(rowsFor(100, 100, 40), 18);
  });
  it('nunca baja de una fila', () => {
    assert.equal(rowsFor(1000, 1, 40), 1);
  });
});

describe('convert · ramp', () => {
  it('mapea claro a espacio y oscuro a tinta densa', () => {
    const result = convert(grid([[0, 128, 250]]), { mode: 'ramp' });
    // 250 es casi papel: cae en los caracteres más ligeros y crop lo respeta
    // porque no es espacio puro… salvo que lo sea; fijamos el caso exacto.
    assert.equal(renderText(result), '@=');
  });
  it('marca como oscuras solo las celdas bajo darkAt', () => {
    const result = convert(grid([[0, 200]]), { mode: 'ramp', darkAt: 88 });
    assert.equal(result[0]?.[0]?.dark, true);
    assert.equal(result[0]?.[1]?.dark, false);
  });
  it('invert voltea la luminancia', () => {
    const plain = renderText(convert(grid([[0, 0, 0]]), { mode: 'ramp' }));
    const inverted = renderText(convert(grid([[255, 255, 255]]), { mode: 'ramp', invert: true }));
    assert.equal(inverted, plain);
  });
});

describe('convert · edges', () => {
  // Bloques 8×8 con una frontera nítida: el sobel debe dibujarla con el
  // carácter que sigue la dirección del borde en pantalla.
  const size = 8;
  function boundary(dark: (x: number, y: number) => boolean): Grid {
    const rows: number[][] = [];
    for (let y = 0; y < size; y++) {
      rows.push(Array.from({ length: size }, (_, x) => (dark(x, y) ? 0 : 255)));
    }
    return grid(rows);
  }

  it('frontera vertical → |', () => {
    const out = renderText(convert(boundary((x) => x < size / 2), { mode: 'edges' }));
    assert.match(out, /\|/);
    assert.doesNotMatch(out, /[-/\\]/);
  });
  it('frontera horizontal → -', () => {
    const out = renderText(convert(boundary((_x, y) => y < size / 2), { mode: 'edges' }));
    assert.match(out, /-/);
    assert.doesNotMatch(out, /[|/\\]/);
  });
  it('diagonal oscura arriba-izquierda → /', () => {
    const out = renderText(convert(boundary((x, y) => x + y < size), { mode: 'edges' }));
    assert.match(out, /\//);
    assert.doesNotMatch(out, /\\/);
  });
  it('diagonal oscura arriba-derecha → \\', () => {
    const out = renderText(convert(boundary((x, y) => x > y), { mode: 'edges' }));
    assert.match(out, /\\/);
    assert.doesNotMatch(out, /\//);
  });
  it('una zona plana no produce trazos', () => {
    const out = convert(grid([[128, 128], [128, 128]]), { mode: 'edges' });
    assert.equal(renderText(out), '');
  });
});

describe('applyGamma', () => {
  it('g > 1 abre las sombras sin tocar los extremos', () => {
    const out = applyGamma(grid([[0, 64, 255]]), 2);
    assert.equal(out.data[0], 0);
    assert.ok((out.data[1] ?? 0) > 64);
    assert.equal(out.data[2], 255);
  });
  it('g = 1 es identidad', () => {
    const out = applyGamma(grid([[0, 100, 200]]), 1);
    assert.deepEqual([...out.data], [0, 100, 200]);
  });
});

describe('percentile', () => {
  it('devuelve extremos y valores intermedios', () => {
    assert.equal(percentile([1, 2, 3, 4, 5], 0), 1);
    assert.equal(percentile([1, 2, 3, 4, 5], 100), 5);
    assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  });
  it('lista vacía → 0', () => {
    assert.equal(percentile([], 90), 0);
  });
});

describe('crop', () => {
  it('recorta filas y columnas vacías en los bordes', () => {
    const padded = cells(['      ', '  ##  ', '  ##  ', '      ']);
    assert.equal(renderText(crop(padded)), '##\n##');
  });
  it('conserva los huecos interiores', () => {
    const holes = cells(['#  #']);
    assert.equal(renderText(crop(holes)), '#  #');
  });
  it('todo vacío → sin filas', () => {
    assert.deepEqual(crop(cells(['   ', '   '])), []);
  });
});

describe('renderHtml', () => {
  it('agrupa rachas oscuras en un solo span', () => {
    const row: Cell[] = [
      { char: '.', dark: false },
      { char: '#', dark: true },
      { char: '@', dark: true },
      { char: '.', dark: false },
    ];
    assert.equal(renderHtml([row]), '.<span class="k">#@</span>.');
  });
  it('los espacios nunca van dentro de un span', () => {
    const row: Cell[] = [
      { char: '#', dark: true },
      { char: ' ', dark: true },
      { char: '#', dark: true },
    ];
    assert.equal(renderHtml([row]), '<span class="k">#</span> <span class="k">#</span>');
  });
  it('escapa HTML también dentro de los spans', () => {
    const row: Cell[] = [
      { char: '<', dark: true },
      { char: '&', dark: false },
    ];
    assert.equal(renderHtml([row]), '<span class="k">&lt;</span>&amp;');
  });
  it('recorta espacios al final de línea', () => {
    assert.equal(renderHtml(cells(['#   '])), '#');
  });
});

describe('escapeHtml', () => {
  it('escapa &, < y >', () => {
    assert.equal(escapeHtml('<a & b>'), '&lt;a &amp; b&gt;');
  });
});
