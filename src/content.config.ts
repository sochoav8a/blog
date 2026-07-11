import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// El campo `publish` del vault se consume en scripts/sync-vault.ts y no llega aquí.
// Cualquier nota que no cumpla este schema rompe el build.
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z
    .object({
      title: z.string().min(1),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      description: z.string().min(1),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    })
    .strict(),
});

export const collections = { posts };
