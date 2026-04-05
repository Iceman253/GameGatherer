import type { Game, DetectionResult } from '../../shared/types'
import { detectSteamGames } from './steam'
import { detectEpicGames } from './epic'
import { detectEaGames } from './ea'
import { fetchEpicCoverUrl } from '../metadata/epicMeta'
import { fetchAllEaPlaytimes, OFFER_ID_RE } from '../metadata/eaMeta'
import { fetchSteamLibrary, normalizeName } from '../metadata/steamApiLib'
import { readConfig } from '../config'

// Games installed via Steam but re-attributed to Epic — try Epic CDN for fresher cover art
const EPIC_SLUG_FOR_STEAM_ID: Record<string, string> = {
  '252950': 'rocket-league'   // Rocket League: always use Epic's current season art
}

export async function aggregateGames(): Promise<DetectionResult> {
  const errors: string[] = []
  const allGames: Game[] = []

  const run = (name: string, fn: () => Game[]): void => {
    try {
      allGames.push(...fn())
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`)
    }
  }

  run('Steam', detectSteamGames)
  run('Epic', detectEpicGames)
  run('EA', detectEaGames)

  // Enrich EA games with playtime from the EA Desktop ISS (single request, ~2s timeout).
  // Only runs when EA Desktop is open; silently no-ops otherwise.
  const eaGamesWithOfferId = allGames.filter(
    (g) => g.store === 'ea' && g.appId && OFFER_ID_RE.test(g.appId)
  )
  if (eaGamesWithOfferId.length > 0) {
    try {
      const playtimes = await fetchAllEaPlaytimes()
      if (playtimes) {
        for (const game of eaGamesWithOfferId) {
          const pt = playtimes.get(game.appId!)
          if (pt) {
            game.playtimeMinutes = pt.minutes
            game.lastPlayed = pt.lastPlayed
          }
        }
      }
    } catch { /* EA Desktop not running — skip silently */ }
  }

  // Enrich all games with playtime from the Steam Web API if credentials are configured.
  // For Steam games: look up by appId (exact) — ACF playtime_forever can be stale or zero.
  // For EA/Epic games: look up by normalized name — covers cross-store ownership.
  try {
    const cfg = readConfig()
    if (cfg.steam?.apiKey && cfg.steam?.steamId) {
      const library = await fetchSteamLibrary(cfg.steam.apiKey, cfg.steam.steamId)
      if (library) {
        for (const game of allGames) {
          // Skip if playtime is already populated from a reliable source (e.g. EA Desktop ISS)
          if (game.playtimeMinutes != null && game.playtimeMinutes > 0) continue

          // For Steam games, look up by appId (most reliable); fall back to name
          // For EA/Epic games, look up by normalized name
          const entry =
            (game.appId ? library.get(game.appId) : undefined) ??
            library.get(normalizeName(game.name))

          if (entry && entry.playtimeMinutes > 0) {
            game.playtimeMinutes = entry.playtimeMinutes
            if (!game.lastPlayed && entry.lastPlayed) {
              game.lastPlayed = entry.lastPlayed
            }
          }
        }
      }
    }
  } catch { /* Steam API unavailable or credentials wrong — skip silently */ }

  // Deduplicate across stores by name (case-insensitive).
  // Prefer the entry from the store that "owns" the game.
  const seen = new Map<string, Game>()
  for (const game of allGames) {
    const key = `${game.store}:${game.name.toLowerCase().trim()}`
    if (!seen.has(key)) seen.set(key, game)
  }

  const deduped = Array.from(seen.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  return { games: deduped, errors }
}

// Runs asynchronously after initial results are sent to the renderer.
// Pushes cover art updates one-by-one as they resolve.
export function enrichEpicCoverArt(
  games: Game[],
  onUpdate: (id: string, url: string) => void
): void {
  for (const game of games) {
    if (game.store !== 'epic') continue

    // Check if this is a Steam-installed Epic game with a known slug
    const steamAppId = game.appId
    const epicSlug = steamAppId ? EPIC_SLUG_FOR_STEAM_ID[steamAppId] : undefined

    // For manifested Epic games, use catalogNamespace; for overridden Steam games, use slug
    const ns = (game as Game & { _catalogNamespace?: string })._catalogNamespace

    if (!ns && !epicSlug) continue

    const fetchPromise = epicSlug
      ? fetchEpicCoverUrl(epicSlug)    // uses slug-based endpoint
      : fetchEpicCoverUrl(ns!)         // uses namespace-based endpoint

    fetchPromise.then((url) => {
      if (url) onUpdate(game.id, url)
    })
  }
}
