// Sincroniza el vault de Obsidian (OBSIDIAN_VAULT_PATH) hacia src/content/posts/.
//
// - Solo publica notas con `publish: true` en el frontmatter.
// - Valida todo antes de escribir: si alguna nota publicable tiene frontmatter
//   inválido, no se toca nada y el proceso sale con error.
// - Es idempotente: src/content/posts/ y public/img/ se regeneran desde cero
//   en cada corrida (no pongas archivos a mano en esos dos directorios).
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { stringify } from 'yaml';
import {
  IMAGE_EXTS,
  collapseBlankLines,
  expandTransclusions,
  noteKey,
  normalizeFrontmatter,
  parseNote,
  slugify,
  transformCallouts,
  transformImageEmbeds,
  transformWikilinks,
  type NoteRegistry,
} from './lib/transform.ts';

const POSTS_DIR = 'src/content/posts';
const IMG_DIR = 'public/img';
const SKIP_DIRS = new Set(['.obsidian', '.trash', '.git']);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function main(): Promise<void> {
  const vaultPath = process.env['OBSIDIAN_VAULT_PATH'];
  if (vaultPath === undefined || vaultPath === '') {
    console.error('error: define OBSIDIAN_VAULT_PATH con la ruta al vault de Obsidian');
    process.exit(1);
  }
  const vaultStat = await stat(vaultPath).catch(() => null);
  if (vaultStat === null || !vaultStat.isDirectory()) {
    console.error(`error: OBSIDIAN_VAULT_PATH no es un directorio: ${vaultPath}`);
    process.exit(1);
  }

  const files = await walk(vaultPath);

  // Adjuntos: basename → ruta absoluta. Obsidian resuelve por basename, así
  // que dos adjuntos distintos con el mismo nombre son ambiguos.
  const attachments = new Map<string, string>();
  const warnings: string[] = [];
  for (const file of files) {
    const ext = path.extname(file).slice(1).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const key = path.basename(file).toLowerCase();
    const existing = attachments.get(key);
    if (existing !== undefined) {
      warnings.push(`adjunto duplicado: ${existing} y ${file} (se usa el primero)`);
    } else {
      attachments.set(key, file);
    }
  }

  // Registro de notas: distingue publicadas de no publicadas para que los
  // wikilinks hacia notas privadas degraden a texto en vez de romper.
  interface SourceNote {
    file: string;
    name: string;
    slug: string;
    data: Record<string, unknown>;
    body: string;
  }
  const registry: NoteRegistry = new Map();
  const published: SourceNote[] = [];
  let skipped = 0;

  for (const file of files) {
    if (path.extname(file).toLowerCase() !== '.md') continue;
    const name = path.basename(file, path.extname(file));
    const { data, body } = parseNote(await readFile(file, 'utf8'));
    const isPublished = data['publish'] === true;
    const key = noteKey(name);
    if (registry.has(key)) {
      warnings.push(`nota duplicada en el vault: "${name}" (se usa la primera)`);
      continue;
    }
    registry.set(key, { slug: slugify(name), published: isPublished, body });
    if (isPublished) {
      published.push({ file, name, slug: slugify(name), data, body });
    } else {
      skipped += 1;
    }
  }

  const slugs = new Map<string, string>();
  const errors: string[] = [];
  for (const note of published) {
    const other = slugs.get(note.slug);
    if (other !== undefined) {
      errors.push(`slug duplicado "${note.slug}": ${other} y ${note.file}`);
    }
    slugs.set(note.slug, note.file);
  }

  // Transformar todo en memoria antes de escribir nada.
  const outputs: { slug: string; content: string }[] = [];
  const copies = new Map<string, string>(); // destino → origen
  const degraded: string[] = [];
  const removedEmbeds: string[] = [];

  for (const note of published) {
    const { fm, errors: fmErrors } = normalizeFrontmatter(note.data, note.name);
    if (fm === null) {
      errors.push(...fmErrors.map((e) => `${note.file}: ${e}`));
      continue;
    }

    const transcluded = expandTransclusions(note.body, registry, new Set([noteKey(note.name)]));
    removedEmbeds.push(...transcluded.removed.map((r) => `${note.name}: ${r}`));
    warnings.push(...transcluded.warnings.map((w) => `${note.name}: ${w}`));

    const images = transformImageEmbeds(transcluded.body, attachments);
    warnings.push(...images.missing.map((m) => `${note.name}: imagen no encontrada ${m}`));
    for (const copy of images.copies) copies.set(copy.file, copy.from);

    const withCallouts = transformCallouts(images.body);

    const links = transformWikilinks(withCallouts, registry);
    degraded.push(...links.degraded.map((d) => `${note.name}: ${d}`));

    const frontmatter = stringify(fm).trimEnd();
    outputs.push({
      slug: note.slug,
      content: `---\n${frontmatter}\n---\n\n${collapseBlankLines(links.body).trim()}\n`,
    });
  }

  if (errors.length > 0) {
    console.error('El sync falló; no se escribió nada:');
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exit(1);
  }

  await rm(POSTS_DIR, { recursive: true, force: true });
  await rm(IMG_DIR, { recursive: true, force: true });
  await mkdir(POSTS_DIR, { recursive: true });
  await mkdir(IMG_DIR, { recursive: true });

  for (const output of outputs) {
    await writeFile(path.join(POSTS_DIR, `${output.slug}.md`), output.content, 'utf8');
  }
  for (const [file, from] of copies) {
    await copyFile(from, path.join(IMG_DIR, file));
  }

  console.log(`Publicadas: ${outputs.length}`);
  console.log(`Saltadas (sin publish: true): ${skipped}`);
  console.log(`Imágenes copiadas: ${copies.size}`);
  if (degraded.length > 0) {
    console.log(`Wikilinks degradados a texto (${degraded.length}):`);
    for (const item of degraded) console.log(`  - ${item}`);
  }
  if (removedEmbeds.length > 0) {
    console.log(`Transclusiones eliminadas (${removedEmbeds.length}):`);
    for (const item of removedEmbeds) console.log(`  - ${item}`);
  }
  if (warnings.length > 0) {
    console.log(`Avisos (${warnings.length}):`);
    for (const item of warnings) console.log(`  ! ${item}`);
  }
}

await main();
