/**
 * EA / Origin metadata source.
 *
 * Metadata  — public Origin ecommerce2 API (no auth required).
 * Playtime  — EA Desktop local ISS HTTP API (requires EA Desktop to be running).
 *
 * Offer ID examples: "Origin.OFR.50.0000166", "OFB-EAST:48217"
 */

import { get as httpGet } from 'http'
import { get as httpsGet } from 'https'
import { fetchJson } from './http'
import type { GameMetadata, StoreRating } from '../../shared/types'

export const OFFER_ID_RE = /^(Origin\.|OFB-)/i

// ─── Origin API types (defensive — EA has changed the schema before) ─────────

interface OriginI18n {
  gameTitle?: string
  shortDesc?: string
  longDesc?: string
}
interface OriginAttrs {
  esrbRating?: string
  genre?: string
  genres?: string | string[]
  developer?: string
  publisher?: string
}
interface OriginProductInfo {
  offerId?: string
  displayProductName?: string
  masterTitleId?: string
  i18n?: Record<string, OriginI18n>
  displayAttributes?: OriginAttrs
}
// Supercat wraps in gameProductInfo but some versions return fields at root
interface OriginSupercat extends OriginProductInfo {
  gameProductInfo?: OriginProductInfo
}
interface OriginSearchOffer {
  offerId?: string
  masterTitleId?: string
}
interface OriginSearchResult {
  offers?: OriginSearchOffer[]
  offer?: OriginSearchOffer[]
}

// ─── ISS (EA Desktop local service) types ────────────────────────────────────

interface IssGameTime {
  softwareId?: string
  totalTimePlayed?: number          // seconds
  multisessionTime?: number         // seconds (some builds use this)
  lastSessionEndTimeStamp?: number  // milliseconds
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** HTTP (non-TLS) fetch for localhost ISS API. */
function fetchLocalJson<T>(url: string, timeoutMs = 1500): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const req = httpGet(url, { timeout: timeoutMs }, (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume(); resolve(null); return
        }
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c: string) => { body += c })
        res.on('end', () => { try { resolve(JSON.parse(body) as T) } catch { resolve(null) } })
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
    } catch { resolve(null) }
  })
}

const ISS_PORTS = [3216, 3213, 3215, 3217, 3218, 3219]

/** Query the EA Desktop local service for a single game's playtime. */
async function fetchIssPlaytime(offerId: string): Promise<{ minutes: number; lastPlayed?: number } | null> {
  const encoded = encodeURIComponent(offerId)
  for (const port of ISS_PORTS) {
    // Try the all-games endpoint first — if it responds the ISS is up
    const allData = await fetchLocalJson<IssGameTime | IssGameTime[]>(
      `http://127.0.0.1:${port}/api/gametime`,
      1000
    )
    if (allData != null) {
      const entries: IssGameTime[] = Array.isArray(allData) ? allData : [allData]
      const entry = entries.find((e) => e.softwareId === offerId)
      if (entry) return issEntryToPlaytime(entry)
      // ISS responded but this game isn't in it
      break
    }
    // Try the per-game endpoint on this port
    const gameData = await fetchLocalJson<IssGameTime | IssGameTime[]>(
      `http://127.0.0.1:${port}/api/gametime?softwareId=${encoded}`,
      1000
    )
    if (gameData != null) {
      const entry = Array.isArray(gameData) ? gameData[0] : gameData
      if (entry) return issEntryToPlaytime(entry)
      break
    }
  }
  return null
}

function issEntryToPlaytime(e: IssGameTime): { minutes: number; lastPlayed?: number } {
  const seconds = e.totalTimePlayed ?? e.multisessionTime ?? 0
  return {
    minutes: Math.round(seconds / 60),
    lastPlayed: e.lastSessionEndTimeStamp ? Math.round(e.lastSessionEndTimeStamp / 1000) : undefined
  }
}

/**
 * Fetch ALL EA game playtimes from the ISS in a single request.
 * Used by the aggregator to populate playtime for all detected EA games at startup.
 * Returns null if EA Desktop is not running.
 */
export async function fetchAllEaPlaytimes(): Promise<Map<string, { minutes: number; lastPlayed?: number }> | null> {
  for (const port of ISS_PORTS) {
    const data = await fetchLocalJson<IssGameTime | IssGameTime[]>(
      `http://127.0.0.1:${port}/api/gametime`,
      2000
    )
    if (data != null) {
      const entries: IssGameTime[] = Array.isArray(data) ? data : [data]
      const map = new Map<string, { minutes: number; lastPlayed?: number }>()
      for (const e of entries) {
        if (e.softwareId) map.set(e.softwareId, issEntryToPlaytime(e))
      }
      return map
    }
  }
  return null
}

/** Try to resolve an offer ID via the Origin catalog search API. */
async function findOfferIdByName(name: string): Promise<string | null> {
  const encoded = encodeURIComponent(name)
  const result = await fetchJson<OriginSearchResult>(
    `https://api1.origin.com/catalogSearch/Offer?query=${encoded}&country=US&locale=en_US&rows=5&start=0`,
    { Accept: 'application/json' }
  )
  const offers = result?.offers ?? result?.offer ?? []
  return offers[0]?.offerId ?? null
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetch metadata for an EA game from the Origin ecommerce2 API.
 * @param appId   - The game's appId (ideally an offer ID like "Origin.OFR.50.0000166")
 * @param gameName - Display name, used as fallback for offer-ID lookup
 * @param gameId   - Internal game ID for the metadata result
 */
export async function fetchEaMetadata(
  appId: string,
  gameName: string,
  gameId: string
): Promise<GameMetadata | null> {
  // Resolve offer ID — use appId if it already looks like an offer ID, otherwise search
  let offerId: string | null = OFFER_ID_RE.test(appId) ? appId : null
  if (!offerId) {
    offerId = await findOfferIdByName(gameName)
    if (!offerId) return null
  }

  const encoded = encodeURIComponent(offerId)

  const [supercatRaw, playtime] = await Promise.all([
    fetchJson<OriginSupercat>(
      `https://api2.origin.com/ecommerce2/public/supercat/${encoded}/en_US`,
      { Accept: 'application/json' }
    ),
    fetchIssPlaytime(offerId)
  ])

  // Normalise: response may nest under gameProductInfo or be flat
  const product: OriginProductInfo = supercatRaw?.gameProductInfo ?? supercatRaw ?? {}

  const i18n = product.i18n?.['en_US']
    ?? (product.i18n ? (Object.values(product.i18n)[0] as OriginI18n | undefined) : undefined)

  const attrs = product.displayAttributes ?? {}

  const description = i18n?.longDesc || i18n?.shortDesc || undefined
  const shortDescription = i18n?.shortDesc || undefined

  if (description) {
    console.log(`[eaMeta] ${gameName} — raw description (first 600 chars):`)
    console.log(description.slice(0, 600))
    console.log(`[eaMeta] total length: ${description.length}`)
  } else {
    console.log(`[eaMeta] ${gameName} — no description returned from Origin API`)
    console.log('[eaMeta] i18n keys:', Object.keys(product.i18n ?? {}))
    console.log('[eaMeta] i18n en_US:', JSON.stringify(i18n))
  }

  // Return null only if we have nothing at all to add
  if (!description && !playtime && !product.masterTitleId) return null

  // Genres — can be a comma-separated string or an array
  let genres: string[] | undefined
  const genreRaw = attrs.genre ?? attrs.genres
  if (genreRaw) {
    genres = Array.isArray(genreRaw)
      ? (genreRaw as string[]).map((g) => g.trim()).filter(Boolean)
      : (genreRaw as string).split(',').map((g) => g.trim()).filter(Boolean)
  }

  // ESRB rating
  let rating: StoreRating | undefined
  if (attrs.esrbRating) {
    const code = attrs.esrbRating.trim()
    const ESRB_LABELS: Record<string, string> = {
      T: 'Teen', M: 'Mature 17+', E: 'Everyone',
      'E10+': 'Everyone 10+', AO: 'Adults Only 18+', RP: 'Rating Pending'
    }
    rating = { format: 'esrb', label: `ESRB: ${ESRB_LABELS[code] ?? code}` }
  }

  // Cover art from masterTitleId CDN (2:3 portrait format, same as Steam library art)
  let coverArtUrl: string | undefined
  if (product.masterTitleId) {
    coverArtUrl = `https://image.origin.com/libs/tiGame/imageserver/v1.0/origin/images/gameboxshots/${product.masterTitleId}-FRONT-LG.jpg`
  }

  const meta: GameMetadata = {
    gameId,
    description,
    shortDescription,
    developer: attrs.developer || undefined,
    publisher: attrs.publisher || undefined,
    genres,
    rating,
    coverArtUrl
  }

  if (playtime) {
    meta.playtimeMinutes = playtime.minutes
    meta.lastPlayed = playtime.lastPlayed
  }

  return meta
}

// ─── EA store page scraper ────────────────────────────────────────────────────

function fetchEaHtml(url: string, redirectsLeft = 5): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const getter = url.startsWith('https') ? httpsGet : httpGet
      const req = getter(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 15000
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
            res.resume()
            const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).toString()
            resolve(fetchEaHtml(next, redirectsLeft - 1))
            return
          }
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            res.resume(); resolve(null); return
          }
          let html = ''
          res.setEncoding('utf8')
          res.on('data', (chunk: string) => { html += chunk })
          res.on('end', () => resolve(html))
          res.on('close', () => resolve(html || null))
        }
      )
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
    } catch { resolve(null) }
  })
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
}

export async function scrapeEaByUrl(url: string, gameId: string): Promise<GameMetadata | null> {
  const html = await fetchEaHtml(url)
  if (!html) return null

  let description: string | undefined
  let genres: string[] | undefined
  let screenshots: string[] | undefined
  let headerImage: string | undefined

  // ── 1. __NEXT_DATA__ (EA's website uses Next.js) ──────────────────────────
  const nextMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (nextMatch) {
    try {
      const data = JSON.parse(nextMatch[1]) as unknown

      const pp = (data as Record<string, unknown>).props as Record<string, unknown>
      const gd = (pp?.pageProps as Record<string, unknown>)?.gameDetails as Record<string, unknown> | undefined

      if (gd) {
        console.log('[eaScrape] shortDescription:', JSON.stringify(gd.shortDescription)?.slice(0, 200))
        console.log('[eaScrape] meta:', JSON.stringify(gd.meta)?.slice(0, 300))
        console.log('[eaScrape] promotions:', JSON.stringify(gd.promotions)?.slice(0, 500))
        console.log('[eaScrape] tagline:', gd.tagline)
      }

      if (gd) {
        // shortDescription is the primary field; some games leave it null
        if (typeof gd.shortDescription === 'string' && gd.shortDescription.length > 10)
          description = gd.shortDescription

        // meta.description is EA's SEO copy — use only if nothing better found
        const meta = gd.meta as Record<string, unknown> | undefined
        const metaDesc = meta?.description ?? meta?.ogDescription
        if (!description && typeof metaDesc === 'string' && metaDesc.length > 10)
          description = metaDesc

        // promotions is an array of content blocks; look for the longest text field
        const promos = Array.isArray(gd.promotions) ? gd.promotions as Record<string, unknown>[] : []
        for (const promo of promos) {
          for (const key of ['description', 'body', 'text', 'copy', 'longDescription', 'content']) {
            const v = promo[key]
            if (typeof v === 'string' && v.length > (description?.length ?? 0))
              description = v
          }
        }
      }

      const genreArr = findArray(data, ['genres', 'genre', 'categories'])
      if (genreArr) {
        genres = genreArr
          .map((g) => (typeof g === 'string' ? g : (g as Record<string, unknown>)?.name as string))
          .filter((g): g is string => !!g)
      }

      // ── Screenshots ─────────────────────────────────────────────────────────
      if (gd) {
        const imageUrls = new Set<string>()

        // heroImage / fallbackImage may be a URL string or an object with a url/src key
        for (const key of ['heroImage', 'fallbackImage', 'packArt']) {
          const v = gd[key]
          const url = typeof v === 'string' ? v : (v as Record<string, unknown> | undefined)?.url ?? (v as Record<string, unknown> | undefined)?.src
          if (typeof url === 'string' && url.startsWith('http')) imageUrls.add(url)
        }

        // promotions may contain image URLs
        const promos = Array.isArray(gd.promotions) ? gd.promotions as Record<string, unknown>[] : []
        for (const promo of promos) {
          for (const key of ['image', 'imageUrl', 'backgroundImage', 'src', 'url']) {
            const v = promo[key]
            const imgUrl = typeof v === 'string' ? v : (v as Record<string, unknown> | undefined)?.url ?? (v as Record<string, unknown> | undefined)?.src
            if (typeof imgUrl === 'string' && imgUrl.startsWith('http')) imageUrls.add(imgUrl)
          }
        }

        screenshots = imageUrls.size > 0 ? [...imageUrls].slice(0, 12) : undefined
        headerImage = typeof gd.heroImage === 'string' ? gd.heroImage
          : (gd.heroImage as Record<string, unknown> | undefined)?.url as string | undefined
      }
    } catch { /* fall through */ }
  }

  if (!description) return null

  return {
    gameId,
    description,
    shortDescription: description.length > 200 ? description.slice(0, 200) + '…' : description,
    genres,
    screenshots,
    headerImage
  }
}

// Recursively search a JSON blob for the first string value matching any of the given keys.
function findString(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  for (const key of keys) {
    const v = (obj as Record<string, unknown>)[key]
    if (typeof v === 'string' && v.trim().length > 30) return v.trim()
  }
  for (const val of Object.values(obj as Record<string, unknown>)) {
    const found = findString(val, keys)
    if (found) return found
  }
  return undefined
}

function findArray(obj: unknown, keys: string[]): unknown[] | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findArray(item, keys)
      if (found) return found
    }
    return undefined
  }
  for (const key of keys) {
    const v = (obj as Record<string, unknown>)[key]
    if (Array.isArray(v) && v.length > 0) return v
  }
  for (const val of Object.values(obj as Record<string, unknown>)) {
    const found = findArray(val, keys)
    if (found) return found
  }
  return undefined
}
