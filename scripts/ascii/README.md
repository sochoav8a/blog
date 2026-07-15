# Generador imagen → ASCII

Convierte cualquier imagen (png, jpg, webp, svg…) en arte ASCII duotono para
los rieles laterales del blog.

## Flujo

1. Deja la imagen fuente en `src/ascii/img/`.
2. Genera:

   ```sh
   pnpm ascii src/ascii/img/mi-foto.png                # trama por brillo
   pnpm ascii src/ascii/img/mi-dibujo.svg --mode edges # solo contorno
   ```

   La previsualización sale por la terminal y el fragmento HTML queda en
   `src/ascii/art/<nombre>.html` (escapado, con las zonas oscuras en
   `<span class="k">` → tinta; el resto lo pinta `.rail-art` en verde línea).

3. Apunta el import en `src/ascii/rails.ts` a la pieza nueva y ponle pie
   (`fig. NN · nombre`).

## Opciones

| Opción          | Qué hace                                                        |
| --------------- | --------------------------------------------------------------- |
| `--mode`, `-m`  | `ramp` (fotográfico, por luminancia) o `edges` (contorno sobel) |
| `--width`, `-w` | columnas de texto; los rieles usan 36                            |
| `--invert`      | voltea claros/oscuros (fotos sobre fondo oscuro)                 |
| `--dark <n>`    | ramp: luminancia 0–255 bajo la que una celda va en tinta         |
| `--edge <n>`    | edges: percentil 0–100 desde el que un gradiente cuenta como trazo (bájalo si salen pocos trazos) |
| `--gamma <g>`   | g > 1 abre las sombras (fotos oscuras), g < 1 las cierra         |
| `--keep-levels` | no estirar el contraste al rango completo                        |
| `--format`      | `html` (duotono, default) o `txt` (plano)                        |
| `--out`, `-o`   | ruta de salida                                                   |

## Consejos

- Funcionan mejor las imágenes con silueta clara sobre fondo liso: el fondo
  claro se vuelve espacio en blanco (la transparencia cuenta como papel).
- `ramp` luce con degradados y volúmenes; `edges` con dibujos de relleno plano.
- En `edges`, los detalles finos necesitan tamaño: a 36 columnas cada celda
  son ~11 px de la imagen reescalada.
- **Fotos complejas**: necesitan densidad — genera a ~64 columnas y marca la
  pieza con `fine: true` en `rails.ts` (trama fina: letra menor y duotono un
  escalón más oscuro). A 36 columnas una escena rica queda en mancha.
- **Fotos oscuras** (p. ej. neo.jpeg): `--gamma 2.2` abre las sombras y separa
  los objetos del fondo. La otra vía es `--invert` con `--gamma 0.7` (cierra
  las sombras antes de invertir): dibuja solo las luces sobre fondo blanco.
- El núcleo puro (sin IO) vive en `convert.ts` y tiene tests: `pnpm test`.
