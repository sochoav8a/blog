// Render 3D en texto: poliedros convexos low-poly trazados por rayos sobre
// una rejilla de caracteres, con sombreado plano por cara. Sin dependencias
// y sin DOM: lo usa el build (primer cuadro, visible sin JS) y el navegador
// (animación; ver components/Ascii3D.astro).

export const SHAPES = ['cube', 'octa', 'pyramid', 'prism', 'gem'] as const;
export type Shape = (typeof SHAPES)[number];

/** Semiespacio n·p <= d, con n unitario. Un poliedro es su intersección. */
type Plane = readonly [number, number, number, number];
type Vec = readonly [number, number, number];

const RAMP = ':-=+*#%@';
/** Desde este nivel de la rampa el carácter va en la tinta clara (.k). */
const BRIGHT = 5;
/** Ancho/alto de una celda de texto (0.6em de ancho, interlineado 1.2). */
const CELL_ASPECT = 0.5;

/** Plano de normal (x, y, z) que pasa por `point`. */
function plane(x: number, y: number, z: number, point: Vec): Plane {
  const l = Math.hypot(x, y, z);
  const n: Vec = [x / l, y / l, z / l];
  return [n[0], n[1], n[2], n[0] * point[0] + n[1] * point[1] + n[2] * point[2]];
}

function build(shape: Shape): Plane[] {
  const planes: Plane[] = [];
  const ring = (count: number, each: (cos: number, sin: number) => void) => {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      each(Math.cos(a), Math.sin(a));
    }
  };
  switch (shape) {
    case 'cube':
      for (const s of [1, -1]) {
        planes.push(plane(s, 0, 0, [s * 0.82, 0, 0]));
        planes.push(plane(0, s, 0, [0, s * 0.82, 0]));
        planes.push(plane(0, 0, s, [0, 0, s * 0.82]));
      }
      break;
    case 'octa':
      for (const sx of [1, -1])
        for (const sy of [1, -1])
          for (const sz of [1, -1]) planes.push(plane(sx, sy, sz, [sx * 1.2, 0, 0]));
      break;
    case 'pyramid':
      planes.push(plane(0, -1, 0, [0, -0.8, 0]));
      ring(4, (c, s) => planes.push(plane(c * 1.75, 0.9, s * 1.75, [0, 1, 0])));
      break;
    case 'prism':
      planes.push(plane(0, 1, 0, [0, 0.9, 0]), plane(0, -1, 0, [0, -0.9, 0]));
      ring(6, (c, s) => planes.push(plane(c, 0, s, [c * 0.8, 0, s * 0.8])));
      break;
    case 'gem':
      for (const sy of [1, -1])
        ring(6, (c, s) => planes.push(plane(c * 1.15, sy * 0.85, s * 1.15, [0, sy * 1.15, 0])));
      break;
  }
  return planes;
}

const CACHE = new Map<Shape, Plane[]>();

/** Forma estable para una clave (p. ej. el slug del post). */
export function shapeFor(seed: string): Shape {
  let hash = 7;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SHAPES[hash % SHAPES.length] ?? 'cube';
}

/**
 * Dibuja `shape` girada `yaw` radianes sobre una rejilla de cols×rows.
 * Devuelve un fragmento HTML para un <pre>: texto plano con las caras más
 * iluminadas envueltas en <span class="k">.
 */
export function renderShape(
  shape: Shape,
  cols: number,
  rows: number,
  yaw: number,
  pitch = 0.5,
): string {
  let planes = CACHE.get(shape);
  if (!planes) {
    planes = build(shape);
    CACHE.set(shape, planes);
  }
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // mundo = Rx(pitch) · Ry(yaw) · objeto
  const toWorld = (x: number, y: number, z: number): Vec => {
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  };
  const toObject = (x: number, y: number, z: number): Vec => {
    const y1 = y * cp + z * sp;
    const z1 = -y * sp + z * cp;
    return [x * cy - z1 * sy, y1, x * sy + z1 * cy];
  };

  // Cámara ortográfica mirando hacia -z; luz fija arriba a la izquierda.
  const dir = toObject(0, 0, -1);
  // Una luz principal y un relleno débil desde abajo a la derecha: así las
  // caras en sombra no se funden entre sí y el volumen se lee completo.
  const light: Vec = [-0.5, 0.62, 0.6];
  const fill: Vec = [0.7, -0.5, 0.5];
  const shade = planes.map(([nx, ny, nz]) => {
    const n = toWorld(nx, ny, nz);
    const key = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
    const low = Math.max(0, n[0] * fill[0] + n[1] * fill[1] + n[2] * fill[2]);
    const lum = Math.min(1, 0.08 + 0.8 * key + 0.3 * low);
    return Math.min(RAMP.length - 1, Math.floor(lum * RAMP.length));
  });
  const denom = planes.map(([nx, ny, nz]) => nx * dir[0] + ny * dir[1] + nz * dir[2]);

  const unitRow = 2.9 / rows;
  const unitCol = unitRow * CELL_ASPECT;
  const lines: string[] = [];
  for (let j = 0; j < rows; j++) {
    let line = '';
    let open = false;
    for (let i = 0; i < cols; i++) {
      const origin = toObject((i + 0.5 - cols / 2) * unitCol, -(j + 0.5 - rows / 2) * unitRow, 10);
      let near = -Infinity;
      let far = Infinity;
      let face = -1;
      for (let p = 0; p < planes.length; p++) {
        const pl = planes[p]!;
        const dist = pl[3] - (pl[0] * origin[0] + pl[1] * origin[1] + pl[2] * origin[2]);
        const d = denom[p]!;
        if (Math.abs(d) < 1e-9) {
          if (dist < 0) {
            near = Infinity;
            break;
          }
          continue;
        }
        const t = dist / d;
        if (d < 0) {
          if (t > near) {
            near = t;
            face = p;
          }
        } else if (t < far) {
          far = t;
        }
      }
      const level = face >= 0 && near <= far ? shade[face]! : -1;
      const bright = level >= BRIGHT;
      if (bright !== open) {
        line += bright ? '<span class="k">' : '</span>';
        open = bright;
      }
      line += level < 0 ? ' ' : RAMP[level];
    }
    if (open) line += '</span>';
    lines.push(line);
  }
  return lines.join('\n');
}
