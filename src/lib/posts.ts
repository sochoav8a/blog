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

// Las fechas del frontmatter parsean como medianoche UTC; formatear en UTC
// evita que corran un día según la zona horaria de la máquina que compila.
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}
