import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collapseBlankLines,
  expandTransclusions,
  normalizeFrontmatter,
  noteKey,
  parseNote,
  slugify,
  transformCallouts,
  transformImageEmbeds,
  transformOutsideCode,
  transformWikilinks,
  type NoteRegistry,
} from './transform.ts';

function registry(entries: Record<string, { slug?: string; published: boolean; body?: string }>): NoteRegistry {
  const map: NoteRegistry = new Map();
  for (const [name, entry] of Object.entries(entries)) {
    map.set(noteKey(name), {
      slug: entry.slug ?? slugify(name),
      published: entry.published,
      body: entry.body ?? '',
    });
  }
  return map;
}

describe('slugify', () => {
  it('pasa a minúsculas y separa con guiones', () => {
    assert.equal(slugify('Contra la nota perfecta'), 'contra-la-nota-perfecta');
  });
  it('elimina acentos y signos', () => {
    assert.equal(slugify('Bitácora: Cartas a Lucilio, de Séneca'), 'bitacora-cartas-a-lucilio-de-seneca');
    assert.equal(slugify('¿Qué es un ensayo?'), 'que-es-un-ensayo');
  });
  it('recorta guiones en los extremos', () => {
    assert.equal(slugify('  ...nota...  '), 'nota');
  });
});

describe('noteKey', () => {
  it('resuelve por basename, sin ruta ni extensión, en minúsculas', () => {
    assert.equal(noteKey('Carpeta/Sub/Mi Nota.md'), 'mi nota');
    assert.equal(noteKey('Mi Nota'), 'mi nota');
  });
});

describe('parseNote', () => {
  it('separa frontmatter y body', () => {
    const { data, body } = parseNote('---\ntitle: Hola\npublish: true\n---\n\nTexto.\n');
    assert.equal(data['title'], 'Hola');
    assert.equal(data['publish'], true);
    assert.equal(body.trim(), 'Texto.');
  });
  it('sin frontmatter devuelve data vacía y el body intacto', () => {
    const { data, body } = parseNote('Solo texto.\n');
    assert.deepEqual(data, {});
    assert.equal(body, 'Solo texto.\n');
  });
});

describe('normalizeFrontmatter', () => {
  it('normaliza al schema del sitio y descarta claves ajenas', () => {
    const { fm, errors } = normalizeFrontmatter(
      {
        publish: true,
        title: 'Título',
        date: new Date('2026-03-01'),
        description: 'Desc',
        tags: ['#ensayo', 'lectura'],
        aliases: ['otro nombre'],
        cssclass: 'x',
      },
      'fallback',
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(fm, {
      title: 'Título',
      date: '2026-03-01',
      description: 'Desc',
      tags: ['ensayo', 'lectura'],
      draft: false,
    });
  });
  it('usa el nombre del archivo si no hay title', () => {
    const { fm } = normalizeFrontmatter(
      { date: '2026-01-01', description: 'x' },
      'Nombre del archivo',
    );
    assert.equal(fm?.title, 'Nombre del archivo');
  });
  it('acepta tags como string', () => {
    const { fm } = normalizeFrontmatter(
      { date: '2026-01-01', description: 'x', tags: 'ensayo, lectura' },
      'n',
    );
    assert.deepEqual(fm?.tags, ['ensayo', 'lectura']);
  });
  it('reporta date y description faltantes', () => {
    const { fm, errors } = normalizeFrontmatter({}, 'n');
    assert.equal(fm, null);
    assert.equal(errors.length, 2);
  });
  it('draft solo es true si es exactamente true', () => {
    const { fm } = normalizeFrontmatter(
      { date: '2026-01-01', description: 'x', draft: 'yes' },
      'n',
    );
    assert.equal(fm?.draft, false);
  });
});

describe('transformOutsideCode', () => {
  it('no toca bloques cercados ni código inline', () => {
    const input = 'a [[x]]\n```\n[[no]]\n```\ny `[[tampoco]]` b [[x]]';
    const out = transformOutsideCode(input, (s) => s.replaceAll('[[x]]', 'LINK'));
    assert.equal(out, 'a LINK\n```\n[[no]]\n```\ny `[[tampoco]]` b LINK');
  });
});

describe('transformWikilinks', () => {
  const reg = registry({
    'Nota Publicada': { published: true },
    'Nota Privada': { published: false },
  });

  it('convierte [[nota]] en link interno si está publicada', () => {
    const { body, degraded } = transformWikilinks('Ver [[Nota Publicada]].', reg);
    assert.equal(body, 'Ver [Nota Publicada](/posts/nota-publicada/).');
    assert.deepEqual(degraded, []);
  });

  it('usa el alias como texto', () => {
    const { body } = transformWikilinks('Ver [[Nota Publicada|esta nota]].', reg);
    assert.equal(body, 'Ver [esta nota](/posts/nota-publicada/).');
  });

  it('degrada a texto plano si la nota no está publicada', () => {
    const { body, degraded } = transformWikilinks('Ver [[Nota Privada]] y [[No Existe|algo]].', reg);
    assert.equal(body, 'Ver Nota Privada y algo.');
    assert.deepEqual(degraded, ['[[Nota Privada]]', '[[No Existe|algo]]']);
  });

  it('resuelve rutas con carpeta por basename', () => {
    const { body } = transformWikilinks('[[Carpeta/Nota Publicada]]', reg);
    assert.equal(body, '[Carpeta/Nota Publicada](/posts/nota-publicada/)');
  });

  it('convierte la sección en ancla', () => {
    const { body } = transformWikilinks('[[Nota Publicada#Una Sección|ahí]]', reg);
    assert.equal(body, '[ahí](/posts/nota-publicada/#una-seccion)');
  });

  it('convierte [[#sección]] en ancla local', () => {
    const { body } = transformWikilinks('[[#Otra Sección]]', reg);
    assert.equal(body, '[Otra Sección](#otra-seccion)');
  });

  it('no toca wikilinks dentro de código', () => {
    const input = '`[[Nota Publicada]]`\n\n```\n[[Nota Publicada]]\n```';
    const { body, degraded } = transformWikilinks(input, reg);
    assert.equal(body, input);
    assert.deepEqual(degraded, []);
  });

  it('no consume embeds ![[...]]', () => {
    const { body } = transformWikilinks('![[Nota Publicada]]', reg);
    assert.equal(body, '![[Nota Publicada]]');
  });
});

describe('transformImageEmbeds', () => {
  const attachments = new Map([
    ['diagrama.png', '/vault/adjuntos/diagrama.png'],
    ['foto rara.jpg', '/vault/foto rara.jpg'],
  ]);

  it('reescribe la imagen y registra la copia', () => {
    const { body, copies } = transformImageEmbeds('![[diagrama.png]]', attachments);
    assert.equal(body, '![](/img/diagrama.png)');
    assert.deepEqual(copies, [{ from: '/vault/adjuntos/diagrama.png', file: 'diagrama.png' }]);
  });

  it('codifica espacios en la URL y conserva el alias como alt', () => {
    const { body } = transformImageEmbeds('![[foto rara.jpg|una foto]]', attachments);
    assert.equal(body, '![una foto](/img/foto%20rara.jpg)');
  });

  it('descarta alias numéricos (ancho de Obsidian)', () => {
    const { body } = transformImageEmbeds('![[diagrama.png|300]]', attachments);
    assert.equal(body, '![](/img/diagrama.png)');
    const { body: body2 } = transformImageEmbeds('![[diagrama.png|300x200]]', attachments);
    assert.equal(body2, '![](/img/diagrama.png)');
  });

  it('elimina el embed y lo reporta si el archivo no existe', () => {
    const { body, missing } = transformImageEmbeds('antes ![[nada.png]] después', attachments);
    assert.equal(body, 'antes  después');
    assert.deepEqual(missing, ['![[nada.png]]']);
  });

  it('ignora embeds que no son imágenes', () => {
    const { body } = transformImageEmbeds('![[Otra Nota]]', attachments);
    assert.equal(body, '![[Otra Nota]]');
  });
});

describe('expandTransclusions', () => {
  it('inlinea el contenido de una nota publicada', () => {
    const reg = registry({
      Fuente: { published: true, body: 'Contenido transcluido.' },
    });
    const { body, removed } = expandTransclusions('Antes\n\n![[Fuente]]\n\nDespués', reg);
    assert.match(body, /Antes\s+Contenido transcluido\.\s+Después/);
    assert.deepEqual(removed, []);
  });

  it('elimina y reporta la transclusión de una nota no publicada', () => {
    const reg = registry({ Privada: { published: false, body: 'secreto' } });
    const { body, removed } = expandTransclusions('![[Privada]]', reg);
    assert.equal(body.trim(), '');
    assert.deepEqual(removed, ['![[Privada]]']);
    assert.ok(!body.includes('secreto'));
  });

  it('expande transclusiones anidadas', () => {
    const reg = registry({
      A: { published: true, body: 'a ![[B]] a' },
      B: { published: true, body: 'b' },
    });
    const { body } = expandTransclusions('![[A]]', reg);
    assert.match(body, /a\s+b\s+a/);
  });

  it('corta ciclos sin colgarse', () => {
    const reg = registry({
      A: { published: true, body: '![[B]]' },
      B: { published: true, body: '![[A]]' },
    });
    const { removed } = expandTransclusions('![[A]]', reg, new Set([noteKey('A')]));
    assert.equal(removed.length, 1);
    assert.match(removed[0] as string, /circular/);
  });

  it('no expande imágenes', () => {
    const reg = registry({});
    const { body, removed } = expandTransclusions('![[foto.png]]', reg);
    assert.equal(body, '![[foto.png]]');
    assert.deepEqual(removed, []);
  });
});

describe('collapseBlankLines', () => {
  it('reduce tres o más saltos a un párrafo', () => {
    assert.equal(collapseBlankLines('a\n\n\n\nb'), 'a\n\nb');
  });
  it('no toca los bloques de código', () => {
    const input = '```\na\n\n\n\nb\n```';
    assert.equal(collapseBlankLines(input), input);
  });
});

describe('transformCallouts', () => {
  it('convierte un callout con título propio', () => {
    const input = '> [!warning] Ojo con esto\n> Primera línea.\n> Segunda **línea**.';
    const out = transformCallouts(input);
    assert.equal(
      out,
      [
        '<div class="callout callout-warning">',
        '<p class="callout-title">Ojo con esto</p>',
        '',
        'Primera línea.',
        'Segunda **línea**.',
        '',
        '</div>',
      ].join('\n'),
    );
  });

  it('usa el tipo capitalizado como título por defecto', () => {
    const out = transformCallouts('> [!note]\n> Texto.');
    assert.ok(out.includes('<p class="callout-title">Note</p>'));
    assert.ok(out.includes('callout-note'));
  });

  it('ignora el marcador de plegado [!note]-', () => {
    const out = transformCallouts('> [!tip]- Plegado\n> Texto.');
    assert.ok(out.includes('callout-tip'));
    assert.ok(out.includes('Plegado'));
    assert.ok(!out.includes('[!tip]'));
  });

  it('no toca blockquotes normales', () => {
    const input = '> Una cita normal.\n> Segunda línea.';
    assert.equal(transformCallouts(input), input);
  });

  it('escapa HTML en el título', () => {
    const out = transformCallouts('> [!note] Uno < dos & tres\n> x');
    assert.ok(out.includes('Uno &lt; dos &amp; tres'));
  });

  it('no convierte callouts dentro de bloques de código', () => {
    const input = '```\n> [!note] ejemplo\n```';
    assert.equal(transformCallouts(input), input);
  });
});
