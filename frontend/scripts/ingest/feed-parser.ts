import { XMLParser } from 'fast-xml-parser'

export interface FeedItem {
  title: string
  link: string
  description: string
  author: string | null
  imageUrl: string | null
  publishedAt: string
  category: string | null
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
})

/**
 * Scarica il contenuto grezzo di un feed (senza parsing). Separata dal
 * parsing così l'ingestion può cachare/riusare il corpo grezzo (vedi
 * redis-cache.ts) senza rifare la richiesta HTTP.
 */
export async function fetchFeedRaw(rssUrl: string, userAgent: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(rssUrl, {
      headers: { 'User-Agent': userAgent },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} durante il fetch del feed`)
    }

    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fa il parsing di un feed RSS 2.0 / Atom già scaricato.
 *
 * Volutamente non fa scraping del contenuto completo dell'articolo: si
 * limita ai campi già presenti nel feed (title, description/summary,
 * enclosure/media per l'immagine, category), per evitare problemi di
 * copyright.
 */
export function parseFeedXml(body: string): FeedItem[] {
  const xml = parser.parse(body)

  // RSS 2.0: <rss><channel><item>...  Atom: <feed><entry>...
  const rawItems = xml.rss?.channel ? xml.rss.channel.item : xml.feed?.entry

  if (!rawItems) {
    return []
  }

  const items = Array.isArray(rawItems) ? rawItems : [rawItems]

  return items.map(parseItem).filter((item): item is FeedItem => item !== null)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseItem(item: any): FeedItem | null {
  try {
    const title = decodeEntities(textOf(item.title))
    const link = decodeEntities(extractLink(item.link))

    if (!title || !link) {
      return null
    }

    const descriptionHtml = decodeEntities(textOf(item.description ?? item.summary ?? ''))
    const author = decodeEntities(extractAuthor(item)) || null
    // L'estrazione immagine legge <img>/<enclosure> dalla versione HTML,
    // quindi va fatta PRIMA di ripulire l'HTML dalla description.
    const imageUrl = extractImage(item, descriptionHtml)
    const publishedAt = extractPublishedAt(item)
    const category = decodeEntities(extractCategory(item.category)) || null
    const description = cleanDescription(descriptionHtml)

    return { title, link, description, author, imageUrl, publishedAt, category }
  } catch {
    return null
  }
}

/**
 * RSS 2.0: <link>https://...</link> è un nodo testuale (stringa).
 * Atom: <link href="https://..." rel="alternate" /> non ha testo, solo
 * attributi (e a volte più tag <link> con rel diversi, es. "self").
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLink(link: any): string {
  if (typeof link === 'string') {
    return link.trim()
  }

  if (Array.isArray(link)) {
    const alternate = link.find((l) => l?.['@_rel'] === 'alternate' || !l?.['@_rel']) ?? link[0]
    return String(alternate?.['@_href'] ?? '').trim()
  }

  if (link && typeof link === 'object') {
    if ('#text' in link) return String(link['#text']).trim()
    if (link['@_href']) return String(link['@_href']).trim()
  }

  return ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAuthor(item: any): string {
  // Atom: <author><name>...</name></author>. RSS 2.0: <author>testo</author>
  // o <dc:creator>testo</dc:creator>.
  const raw = item.author ?? item['dc:creator'] ?? ''
  if (raw && typeof raw === 'object' && 'name' in raw) {
    return textOf(raw.name)
  }
  return textOf(raw)
}

/**
 * Molti feed WordPress mettono più tag <category> per item (categoria +
 * tag di post). Li unisce in un'unica stringa leggibile, gestendo sia
 * elementi testuali sia elementi con attributi (es. <category
 * domain="...">testo</category>), invece di affidarsi al comportamento
 * implicito di Array.toString() (che produce "[object Object]" se un
 * elemento non è una stringa semplice).
 */
function extractCategory(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => textOf(entry))
      .filter(Boolean)
      .join(' | ')
  }
  return textOf(value ?? '')
}

/**
 * Alcune fonti WordPress mettono markup HTML dentro <description> (<p>,
 * <a href>, ...): un componente che lo renderizza come testo puro
 * mostrerebbe i tag letterali. Qui si rimuovono i tag e, per i feed che
 * aggiungono un paragrafo di attribuzione automatico in coda
 * ("L'articolo X proviene da Y."), anche quello — non fa parte
 * dell'excerpt reale dell'articolo.
 */
export function cleanDescription(html: string): string {
  const withoutTags = html.replace(/<[^>]+>/g, ' ')
  const withoutFooter = withoutTags.replace(/\s*L['’]articolo .+? proviene da .+?\.\s*$/i, '')
  return withoutFooter.replace(/\s+/g, ' ').trim()
}

function textOf(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object' && value !== null && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text']).trim()
  }
  return String(value).trim()
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * Alcuni feed (spesso WordPress) mettono testo già HTML-encoded dentro un
 * CDATA: l'XML non decodifica le entità al suo interno (è testo letterale
 * per definizione), quindi titoli/excerpt arriverebbero con "&#8217;" ecc.
 * letterali invece dell'apostrofo. Decodifica qui le entità più comuni.
 */
function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isNaN(code) ? match : String.fromCodePoint(code)
    }
    return NAMED_ENTITIES[entity] ?? match
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImage(item: any, descriptionHtml: string): string | null {
  if (item.enclosure?.['@_url']) {
    const type = item.enclosure['@_type'] ?? ''
    if (type === '' || String(type).startsWith('image')) {
      return decodeEntities(String(item.enclosure['@_url']))
    }
  }

  const media = item['media:content'] ?? item['media:thumbnail']
  if (media?.['@_url']) {
    return decodeEntities(String(media['@_url']))
  }

  // descriptionHtml è già passato per decodeEntities dal chiamante.
  const match = descriptionHtml.match(/<img[^>]+src="([^"]+)"/i)
  return match ? match[1] : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPublishedAt(item: any): string {
  const raw = textOf(item.pubDate ?? item.published ?? item.updated ?? '')
  if (!raw) return new Date().toISOString()

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}
