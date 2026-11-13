---
title: "Demo: guía de estilos"
date: 2026-11-10
updated: 2026-11-12
description: Nota de muestra con todos los elementos de la prosa, para juzgar el rediseño. Es un draft, no se publica.
tags:
  - demo
  - ensayo
draft: true
---

Esta nota existe solo para ver el diseño con contenido real. Es un `draft`: aparece en `pnpm dev`, nunca en el build, y el próximo `pnpm sync` la borra sola.

Un párrafo largo sirve para medir la columna de lectura. Escribir es pensar despacio: uno cree que tiene una idea hasta que intenta ponerla en una frase y descubre que solo tenía el contorno. Lo que queda en la página es menos de lo que se imaginaba y, con suerte, más preciso. Aquí va un [enlace de ejemplo](https://example.com) y algo de **énfasis fuerte** junto a *énfasis suave*.

## Un subtítulo de sección

> Uno no escribe para decir lo que piensa, sino para averiguar qué piensa.

Las listas también cuentan:

- Primera idea, corta.
- Segunda idea, un poco más larga para ver cómo envuelve la línea cuando no cabe en el ancho de la columna.
- Tercera idea.

1. Leer.
2. Subrayar.
3. Volver a leer lo subrayado.

### Un subtítulo menor

<div class="callout callout-note">
<p class="callout-title">Nota</p>

Así se ven los callouts que vienen de Obsidian (`> [!note]`).

</div>

<div class="callout callout-warning">
<p class="callout-title">Warning</p>

Y este es el de aviso.

</div>

```ts
// Un bloque de código
export function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
```

---

![](/img/Pasted%20image%2020260711210047.png)

Y un párrafo final para cerrar la nota después de la imagen.
