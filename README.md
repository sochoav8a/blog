# santiagoascii.com

Blog personal en [Astro](https://astro.build). El contenido vive en un vault de
Obsidian (repo privado, separado); este repo solo contiene el sitio y el
markdown ya transformado.

## Flujo de publicación

1. Marca notas en el vault con `publish: true` en el frontmatter.
2. `OBSIDIAN_VAULT_PATH=/ruta/al/vault pnpm sync` — transforma las notas
   publicadas a markdown estándar en `src/content/posts/` y copia sus imágenes
   a `public/img/`. Ambos directorios son propiedad del sync: se regeneran
   desde cero en cada corrida, no edites nada a mano ahí.
3. Revisa el diff, commitea, push. Cloudflare Pages compila y despliega.

El build (local, CI o Cloudflare) nunca lee el vault: solo compila lo commiteado.

## Comandos

| Comando      | Qué hace                                            |
| ------------ | --------------------------------------------------- |
| `pnpm dev`   | Servidor de desarrollo (los drafts sí se muestran)  |
| `pnpm sync`  | Sincroniza el vault → `src/content/posts/`          |
| `pnpm check` | Typecheck (`astro check`)                           |
| `pnpm test`  | Tests del sync (`node --test`, sin deps)            |
| `pnpm build` | Build de producción a `dist/`                       |

Requisitos: Node 24 (`.node-version`) y pnpm 11 (`packageManager`); con
corepack basta. Los tests y el script de sync corren con el TypeScript nativo
de Node, sin transpilador.

## Frontmatter de las notas del vault

```yaml
publish: true        # obligatorio para publicar; no llega al sitio
title: Mi ensayo     # opcional: si falta, se usa el nombre del archivo
date: 2026-07-05     # obligatorio
updated: 2026-07-09  # opcional
description: Una línea.  # obligatorio
tags: [ensayo]       # opcional
draft: true          # opcional: visible en dev, excluido del build
```

Una nota con `publish: true` y frontmatter inválido aborta el sync sin
escribir nada. Una nota inválida en `src/content/posts/` rompe el build
(schema estricto en `src/content.config.ts`).

## Deploy (Cloudflare Pages)

Proyecto conectado al repo por integración git. Configuración de build:

- **Build command**: `pnpm build`
- **Output**: `dist` (también declarado en `wrangler.toml`)

La identidad del sitio (título, descripción, dominio) se edita en `src/site.ts`;
los tokens de diseño en `src/styles/global.css`.
