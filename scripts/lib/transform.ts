// Transformaciones puras de sintaxis Obsidian → markdown estándar.
// Sin IO: reciben datos, devuelven datos. El IO vive en sync-vault.ts.
import { parse } from 'yaml';

export interface RegistryEntry {
  /** Slug del post generado (nombre de archivo destino sin .md). */
  slug: string;
  published: boolean;
  /** Body sin frontmatter, para transclusiones. */
  body: string;
}

/** Clave: basename de la nota sin extensión, en minúsculas. */
export type NoteRegistry = Map<string, RegistryEntry>;

export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp']);

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Clave de búsqueda de una referencia wikilink: Obsidian resuelve por basename. */
export function noteKey(target: string): string {
  const base = target.split('/').pop() ?? target;
  return base.replace(/\.md$/i, '').trim().toLowerCase();
}

export function parseNote(source: string): { data: Record<string, unknown>; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: source };
  const parsed: unknown = parse(match[1] ?? '');
  const data =
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, body: source.slice(match[0].length) };
}

// --- Frontmatter ---

export interface PostFrontmatter {
  title: string;
  date: string;
  updated?: string;
  description: string;
  tags: string[];
  draft: boolean;
}

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && !Number.isNaN(new Date(value).valueOf())) {
    return value;
  }
  return null;
}

function toTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(/[,\s]+/)
      : [];
  return raw.map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean);
}

/**
 * Normaliza el frontmatter del vault al schema del sitio. `publish` se descarta
 * (ya se consumió para decidir la publicación) igual que cualquier otra clave
 * ajena al schema, que es estricto.
 */
export function normalizeFrontmatter(
  data: Record<string, unknown>,
  fallbackTitle: string,
): { fm: PostFrontmatter | null; errors: string[] } {
  const errors: string[] = [];

  const title =
    typeof data['title'] === 'string' && data['title'].trim() !== ''
      ? data['title'].trim()
      : fallbackTitle;

  const date = toIsoDate(data['date']);
  if (date === null) errors.push('falta `date` (o no es una fecha válida)');

  const updated = data['updated'] === undefined ? undefined : toIsoDate(data['updated']);
  if (updated === null) errors.push('`updated` no es una fecha válida');

  const description =
    typeof data['description'] === 'string' && data['description'].trim() !== ''
      ? data['description'].trim()
      : null;
  if (description === null) errors.push('falta `description`');

  if (errors.length > 0) return { fm: null, errors };

  return {
    fm: {
      title,
      date: date as string,
      ...(typeof updated === 'string' ? { updated } : {}),
      description: description as string,
      tags: toTags(data['tags']),
      draft: data['draft'] === true,
    },
    errors,
  };
}

// --- Código: las transformaciones no deben tocar bloques ni spans de código ---

const CODE_RE = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]+`/g;

export function transformOutsideCode(body: string, fn: (segment: string) => string): string {
  const parts: string[] = [];
  let last = 0;
  for (const match of body.matchAll(CODE_RE)) {
    parts.push(fn(body.slice(last, match.index)), match[0]);
    last = match.index + match[0].length;
  }
  parts.push(fn(body.slice(last)));
  return parts.join('');
}

// --- Transclusiones: ![[otra-nota]] ---

const EMBED_RE = /!\[\[([^\]|#\n]+)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]/g;

function isImageTarget(target: string): boolean {
  const ext = target.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTS.has(ext);
}

export interface TransclusionResult {
  body: string;
  /** Embeds eliminados (nota no publicada, inexistente o ciclo). */
  removed: string[];
  warnings: string[];
}

export function expandTransclusions(
  body: string,
  registry: NoteRegistry,
  visited: ReadonlySet<string> = new Set(),
): TransclusionResult {
  const removed: string[] = [];
  const warnings: string[] = [];
  const out = transformOutsideCode(body, (segment) =>
    segment.replace(EMBED_RE, (raw, target: string, heading?: string) => {
      target = target.trim();
      if (isImageTarget(target)) return raw;
      const key = noteKey(target);
      const note = registry.get(key);
      if (note === undefined || !note.published) {
        removed.push(raw);
        return '';
      }
      if (visited.has(key)) {
        removed.push(`${raw} (transclusión circular)`);
        return '';
      }
      if (heading !== undefined) {
        warnings.push(`${raw}: transclusión de sección no soportada; se insertó la nota completa`);
      }
      const inner = expandTransclusions(note.body, registry, new Set([...visited, key]));
      removed.push(...inner.removed);
      warnings.push(...inner.warnings);
      return `\n\n${inner.body.trim()}\n\n`;
    }),
  );
  return { body: out, removed, warnings };
}

// --- Imágenes: ![[imagen.png]] ---

export interface ImageResult {
  body: string;
  /** Copias pendientes: ruta absoluta origen → nombre de archivo destino. */
  copies: { from: string; file: string }[];
  /** Embeds de imagen cuyo archivo no se encontró en el vault. */
  missing: string[];
}

export function transformImageEmbeds(
  body: string,
  attachments: ReadonlyMap<string, string>,
): ImageResult {
  const copies: ImageResult['copies'] = [];
  const missing: string[] = [];
  const out = transformOutsideCode(body, (segment) =>
    segment.replace(EMBED_RE, (raw, target: string, _heading?: string, alias?: string) => {
      target = target.trim();
      if (!isImageTarget(target)) return raw;
      const file = target.split('/').pop() ?? target;
      const from = attachments.get(file.toLowerCase());
      if (from === undefined) {
        missing.push(raw);
        return '';
      }
      copies.push({ from, file });
      // En Obsidian el alias de una imagen puede ser un ancho ("300" o "300x200");
      // eso no es texto alternativo y se descarta.
      const alt = alias !== undefined && !/^\d+(x\d+)?$/.test(alias.trim()) ? alias.trim() : '';
      return `![${alt}](/img/${encodeURI(file)})`;
    }),
  );
  return { body: out, copies, missing };
}

// --- Callouts: > [!note] Título ---

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Convierte callouts de Obsidian en bloques `<div class="callout callout-{tipo}">`.
 * Las líneas en blanco alrededor del contenido hacen que CommonMark siga
 * procesando el markdown interior; el div queda estilable desde CSS.
 */
export function transformCallouts(body: string): string {
  return transformOutsideCode(body, (segment) => {
    const lines = segment.split('\n');
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i] as string;
      const match = line.match(/^>\s*\[!(\w+)\][+-]?\s*(.*)$/);
      if (match === null) {
        out.push(line);
        i += 1;
        continue;
      }
      const type = (match[1] as string).toLowerCase();
      const customTitle = (match[2] as string).trim();
      const title = customTitle !== '' ? customTitle : type.charAt(0).toUpperCase() + type.slice(1);
      const content: string[] = [];
      i += 1;
      while (i < lines.length && (lines[i] as string).startsWith('>')) {
        content.push((lines[i] as string).replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(
        `<div class="callout callout-${type}">`,
        `<p class="callout-title">${escapeHtml(title)}</p>`,
        '',
        ...content,
        '',
        '</div>',
      );
    }
    return out.join('\n');
  });
}

/** Colapsa las líneas en blanco sobrantes que dejan transclusiones y embeds eliminados. */
export function collapseBlankLines(body: string): string {
  return transformOutsideCode(body, (segment) =>
    segment.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n'),
  );
}

// --- Wikilinks: [[nota]], [[nota|alias]], [[nota#sección]], [[#sección]] ---

const WIKILINK_RE = /(?<!!)\[\[([^\]|#\n]*)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]/g;

export interface WikilinkResult {
  body: string;
  /** Wikilinks degradados a texto plano (destino no publicado o inexistente). */
  degraded: string[];
}

export function transformWikilinks(body: string, registry: NoteRegistry): WikilinkResult {
  const degraded: string[] = [];
  const out = transformOutsideCode(body, (segment) =>
    segment.replace(WIKILINK_RE, (raw, target: string, heading?: string, alias?: string) => {
      target = target.trim();
      const text = alias?.trim() ?? target;
      if (target === '') {
        // [[#sección]]: ancla dentro de la misma nota.
        if (heading === undefined) return raw;
        return `[${alias?.trim() ?? heading.trim()}](#${slugify(heading)})`;
      }
      const note = registry.get(noteKey(target));
      if (note === undefined || !note.published) {
        degraded.push(raw);
        return text;
      }
      const anchor = heading !== undefined ? `#${slugify(heading)}` : '';
      return `[${text}](/posts/${note.slug}/${anchor})`;
    }),
  );
  return { body: out, degraded };
}
