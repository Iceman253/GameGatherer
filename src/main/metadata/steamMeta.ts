import { get as httpsGet } from 'https'
import { fetchJson } from './http'
import { inferStoreFromPublisher } from './crossStore'
import type { GameMetadata, StoreRating, GameStore } from '../../shared/types'

// ─── Steam Store API types ────────────────────────────────────────────────────

interface SteamAppData {
  name: string
  short_description?: string
  detailed_description?: string
  header_image?: string
  developers?: string[]
  publishers?: string[]
  genres?: { id: string; description: string }[]
  categories?: { id: number; description: string }[]
  release_date?: { coming_soon: boolean; date: string }
  screenshots?: { id: number; path_thumbnail: string; path_full: string }[]
  metacritic?: { score: number; url: string }
  website?: string
}

interface SteamAppDetails {
  success: boolean
  data?: SteamAppData
}

interface SteamReviews {
  query_summary?: {
    review_score: number
    review_score_desc: string
    total_positive: number
    total_negative: number
    total_reviews: number
  }
}

// Strip HTML tags from Steam's description strings
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function fetchSteamMetadata(appId: string, gameId: string): Promise<GameMetadata | null> {
  // Parallel fetch: app details + reviews
  const [detailsResponse, reviewsResponse] = await Promise.all([
    fetchJson<Record<string, SteamAppDetails>>(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`
    ),
    fetchJson<SteamReviews>(
      `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`
    )
  ])

  const entry = detailsResponse?.[appId]
  if (!entry?.success || !entry.data) return null

  const d = entry.data

  // Build rating from reviews
  let rating: StoreRating | undefined
  const qs = reviewsResponse?.query_summary
  if (qs && qs.total_reviews > 0) {
    rating = {
      score: Math.round((qs.total_positive / qs.total_reviews) * 100),
      label: qs.review_score_desc,
      reviewCount: qs.total_reviews,
      positiveCount: qs.total_positive,
      format: 'steam_reviews'
    }
  } else if (d.metacritic) {
    rating = {
      score: d.metacritic.score,
      label: `Metacritic ${d.metacritic.score}`,
      format: 'metacritic'
    }
  }

  // Check publisher for cross-store attribution
  const allPublishers = [...(d.developers ?? []), ...(d.publishers ?? [])]
  let realStore: GameStore | undefined
  for (const pub of allPublishers) {
    const inferred = inferStoreFromPublisher(pub)
    if (inferred) { realStore = inferred; break }
  }

  const screenshots = (d.screenshots ?? [])
    .map((s) => s.path_full)
    .slice(0, 12)

  return {
    gameId,
    description: d.detailed_description ?? undefined,
    shortDescription: d.short_description ?? undefined,
    releaseDate: d.release_date?.coming_soon === false ? d.release_date.date : undefined,
    developer: d.developers?.join(', '),
    publisher: d.publishers?.join(', '),
    genres: d.genres?.map((g) => g.description),
    screenshots,
    headerImage: d.header_image,
    rating,
    website: d.website || undefined,
    realStore
  }
}

// ─── Steam page scraper (used when pasting a Steam URL manually) ──────────────

function fetchSteamHtml(url: string, redirectsLeft = 5): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = httpsGet(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            // Bypass Steam's age gate and mature content check
            Cookie: 'birthtime=631152001; mature_content=1; lastagecheckage=1-0-1990'
          },
          timeout: 15000
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
            res.resume()
            const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).toString()
            resolve(fetchSteamHtml(next, redirectsLeft - 1))
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

function extractBetweenTags(html: string, openRe: RegExp): string | null {
  const start = html.search(openRe)
  if (start === -1) return null
  // Walk forward tracking open/close <div> depth to find the matching closing tag
  const tagStart = html.indexOf('>', start) + 1
  let depth = 1
  let i = tagStart
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', i)
    const nextClose = html.indexOf('</div>', i)
    if (nextClose === -1) break
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      if (depth === 0) return html.slice(tagStart, nextClose)
      i = nextClose + 6
    }
  }
  return null
}

export async function scrapeSteamByUrl(url: string, gameId: string): Promise<GameMetadata | null> {
  const html = await fetchSteamHtml(url)
  if (!html) return null

  // ── Description: the "About the Game" block ──────────────────────────────────
  const descHtml = extractBetweenTags(html, /id=["']game_area_description["']/)
  let description: string | undefined
  if (descHtml) {
    // Remove the "About the Game" heading Steam puts at the top, keep the rest as HTML
    description = descHtml
      .replace(/<h2[^>]*>About\s+(the\s+)?[Gg]ame<\/h2>/i, '')
      .replace(/<h1[^>]*>About\s+(the\s+)?[Gg]ame<\/h1>/i, '')
      .trim()
  }
  if (!description) return null

  // ── Short description: og:description or first plain-text sentence ───────────
  const ogMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
              ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)
  const shortDescription = ogMatch?.[1]?.trim()

  // ── Genres: links inside the genre/tags block ─────────────────────────────────
  const genreBlock = extractBetweenTags(html, /id=["'](?:genresAndManufacturer|game_area_details_specs)["']/)
  const genres: string[] = []
  if (genreBlock) {
    const linkRe = /<a[^>]+href=["'][^"']*\/genre\/[^"']*["'][^>]*>([^<]+)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = linkRe.exec(genreBlock)) !== null) {
      const g = m[1].trim()
      if (g) genres.push(g)
    }
  }

  // ── Developer (only) ─────────────────────────────────────────────────────────
  // Steam renders each row as: <b>Developer:</b> ... <a href="...">Name</a>
  // Capture only the text in the anchor that immediately follows "Developer:"
  const devMatch = html.match(/Developer:\s*<\/b>\s*(?:<[^>]+>\s*)*<a[^>]*>([^<]+)<\/a>/i)

  // ── Release date ──────────────────────────────────────────────────────────────
  // Steam: <b>Release Date:</b> ... <span class="date">Oct 19, 2017</span>
  const relMatch = html.match(/Release Date:\s*<\/b>\s*(?:<[^>]+>\s*)*<span[^>]*class=["'][^"']*date[^"']*["'][^>]*>([^<]+)<\/span>/i)
               ?? html.match(/Release Date:\s*<\/b>[^<]*<br[^>]*>\s*([^<]{4,30})/i)
  const releaseDate = relMatch?.[1]?.trim()

  // ── Header image ──────────────────────────────────────────────────────────────
  const imgMatch = html.match(/<img[^>]+id=["']game_header_image_full["'][^>]+src=["']([^"']+)["']/i)
              ?? html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
              ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  const headerImage = imgMatch?.[1]

  // ── Screenshots + reviews via API (screenshots aren't in the page HTML) ────────
  let screenshots: string[] | undefined
  let rating: StoreRating | undefined
  const appIdMatch = url.match(/\/app\/(\d+)/i)
  if (appIdMatch) {
    const appId = appIdMatch[1]
    const [detailsResp, reviewsResp] = await Promise.all([
      fetchJson<Record<string, SteamAppDetails>>(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`
      ),
      fetchJson<SteamReviews>(
        `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`
      )
    ])

    const apiData = detailsResp?.[appId]?.data
    if (apiData?.screenshots?.length) {
      screenshots = apiData.screenshots.map((s) => s.path_full).slice(0, 12)
    }

    const qs = reviewsResp?.query_summary
    if (qs && qs.total_reviews > 0) {
      rating = {
        score: Math.round((qs.total_positive / qs.total_reviews) * 100),
        label: qs.review_score_desc,
        reviewCount: qs.total_reviews,
        positiveCount: qs.total_positive,
        format: 'steam_reviews'
      }
    }
  }

  return {
    gameId,
    description,
    shortDescription,
    genres: genres.length > 0 ? genres : undefined,
    developer: devMatch?.[1]?.trim(),
    releaseDate,
    headerImage,
    screenshots,
    rating
  }
}
