import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

// En dev los drafts se incluyen para poder previsualizarlos; en build quedan fuera
// de todo (páginas, índices, RSS, sitemap, OG).
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection(
    'posts',
    ({ data }) => import.meta.env.DEV || !data.draft,
  );
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

// Fechas ISO (YYYY-MM-DD), como metadatos de un archivo: parte de la estética
// del sitio. Se corta el ISO completo, que ya está en UTC, para que la fecha
// no corra un día según la zona horaria de la máquina que compila.
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Datos de "archivo" de un post: palabras, minutos de lectura y un tamaño
// legible (bytes del markdown), para las fichas del listado y del post.
export function postStats(post: Post): { words: number; minutes: number; size: string } {
  const body = post.body ?? '';
  const words = body.split(/\s+/).filter(Boolean).length;
  const bytes = new TextEncoder().encode(body).length;
  const size = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  return { words, minutes: Math.max(1, Math.round(words / 220)), size };
}
