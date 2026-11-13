import { readFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { getPublishedPosts } from '../../lib/posts';
import { SITE } from '../../site';

// 1200×630 por post, más /og/default.png para el resto de páginas.
// Los paths son relativos a la raíz del proyecto (cwd durante astro build):
// import.meta.url apunta al bundle en dist/ y no sirve para localizar assets.
const FONT_DIR = './node_modules/@fontsource/ibm-plex-mono/files';
const fontRegular = readFile(`${FONT_DIR}/ibm-plex-mono-latin-400-normal.woff`);
const fontBold = readFile(`${FONT_DIR}/ibm-plex-mono-latin-700-normal.woff`);

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

// Misma paleta que el sitio (tokens de src/styles/global.css).
const C = {
  paper: '#0c0e13',
  panel: '#181c26',
  bright: '#f5f6fa',
  muted: '#8f97ab',
  line: '#7f8aa8',
  pop: '#e8413c',
  shadow: '#2a3350',
};

export async function GET({ props }: { props: Props }) {
  const svg = await satori(
    node(
      'div',
      {
        width: '100%',
        height: '100%',
        display: 'flex',
        padding: 36,
        backgroundColor: C.paper,
        fontFamily: 'IBM Plex Mono',
      },
      node(
        'div',
        {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 56px',
          backgroundColor: C.panel,
          border: `3px dashed ${C.line}`,
          color: C.bright,
        },
        [
          node('div', { display: 'flex', fontSize: 26, color: C.muted }, [
            node('span', { color: C.pop, marginRight: 16 }, '=='),
            node('span', {}, 'memory card 1'),
          ]),
          node(
            'div',
            {
              fontSize: 60,
              fontWeight: 700,
              lineHeight: 1.2,
              lineClamp: 4,
              textShadow: `4px 4px 0 ${C.shadow}`,
            },
            props.title,
          ),
          node('div', { display: 'flex', fontSize: 28, color: C.muted }, [
            node('span', { color: C.pop, marginRight: 16 }, '>'),
            node('span', {}, props.subtitle),
          ]),
        ],
      ),
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'IBM Plex Mono', data: await fontRegular, weight: 400, style: 'normal' },
        { name: 'IBM Plex Mono', data: await fontBold, weight: 700, style: 'normal' },
      ],
    },
  );

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png' },
  });
}
