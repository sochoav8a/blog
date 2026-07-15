// Arte ASCII de los rieles laterales (portada y páginas de tag).
//
// Flujo: deja la imagen fuente en src/ascii/img/ y corre el generador —
//   pnpm ascii src/ascii/img/neo.jpeg --width 64 --gamma 2.2
//   pnpm ascii src/ascii/img/yo.jpg --width 64
// La salida cae en src/ascii/art/<nombre>.html como fragmento duotono ya
// escapado (spans .k = tinta). Aquí solo se importa cruda y se le pone pie.
// Para cambiar una pieza: genera la nueva y apunta el import.
//
// `fine: true` usa la trama fina (letra menor, ~64 columnas): es lo que
// necesitan las fotos para leerse como medio tono. Los dibujos de silueta
// (planeta.svg / cohete.svg, a 36 columnas) van mejor sin ella.
import neo from './art/yo.html?raw';
import yo from './art/superyo.html?raw';

export interface RailArt {
  /** Fragmento HTML escapado, salida del generador (AsciiRail usa set:html). */
  art: string;
  /** Pie de figura opcional, estilo lámina de museo. */
  label?: string;
  /** Trama fina para fotos densas (clase .rail-art-fine). */
  fine?: boolean;
}

export const railLeft: RailArt = { art: neo, label: 'fig. 01 · yo', fine: true };
export const railRight: RailArt = { art: yo, label: 'fig. 02 · superyo', fine: true };
