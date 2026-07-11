import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { markdownToHtml } from 'satteri';
import { getPublishedPosts } from '../lib/posts';
import { SITE } from '../site';

// Feed completo: el body se renderiza con Sätteri, el mismo motor que usa el
// sitio, así el HTML del feed coincide con el de las páginas.
export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/posts/${post.id}/`,
      categories: post.data.tags,
      content: markdownToHtml(post.body ?? '', { features: { gfm: true } }).html,
    })),
  });
}
