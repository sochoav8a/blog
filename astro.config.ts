import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://santiagoascii.com',
  integrations: [sitemap()],
  // El resaltado de código toma sus colores de los tokens del sitio
  // (variables --astro-code-* en src/styles/global.css).
  markdown: {
    shikiConfig: { theme: 'css-variables' },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
