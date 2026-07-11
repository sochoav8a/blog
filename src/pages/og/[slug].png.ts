import { readFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { getPublishedPosts } from '../../lib/posts';
import { SITE } from '../../site';

// 1200×630 por post, más /og/default.png para el resto de páginas.
// Los paths son relativos a la raíz del proyecto (cwd durante astro build):
// import.meta.url apunta al bundle en dist/ y no sirve para localizar assets.
const fontRegular = readFile('./src/assets/og/Literata-Regular.ttf');
const fontSemiBold = readFile('./src/assets/og/Literata-SemiBold.ttf');

export async function getStaticPaths() {
  const posts = await getPublishedPosts();
  return [
    { params: { slug: 'default' }, props: { title: SITE.title, subtitle: SITE.description } },
    ...posts.map((post) => ({
      params: { slug: post.id },
      props: { title: post.data.title, subtitle: SITE.url.replace('https://', '') },
    })),
  ];
}

// Satori acepta un árbol de nodos tipo React sin necesidad de JSX.
function node(type: string, style: Record<string, unknown>, children?: unknown) {
  return { type, props: { style, children } };
}

interface Props {
  title: string;
  subtitle: string;
}

export async function GET({ props }: { props: Props }) {
  const svg = await satori(
    node(
      'div',
      {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        backgroundColor: '#f4f5f2',
        color: '#1a1d1c',
        fontFamily: 'Literata',
        borderLeft: '20px solid #1d3fbb',
      },
      [
        node(
          'div',
          { fontSize: 62, fontWeight: 600, lineHeight: 1.15, lineClamp: 4 },
          props.title,
        ),
        node('div', { fontSize: 28, color: '#5c6461' }, props.subtitle),
      ],
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Literata', data: await fontRegular, weight: 400, style: 'normal' },
        { name: 'Literata', data: await fontSemiBold, weight: 600, style: 'normal' },
      ],
    },
  );

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png' },
  });
}
