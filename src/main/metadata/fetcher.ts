import type { Game, GameMetadata } from '../../shared/types'
import { fetchSteamMetadata } from './steamMeta'
import { fetchEpicMetadata } from './epicMeta'
import { fetchEaMetadata } from './eaMeta'
import { fetchIgdbMetadata } from './igdbMeta'

// In-memory cache — cleared on app restart (fine for a desktop app session)
const metadataCache = new Map<string, GameMetadata>()

export async function getGameMetadata(game: Game, forceRefresh = false): Promise<GameMetadata | null> {
  if (!forceRefresh && metadataCache.has(game.id)) return metadataCache.get(game.id)!
  metadataCache.delete(game.id)

  let meta: GameMetadata | null = null

  try {
    if (game.store === 'steam' && game.appId) {
      meta = await fetchSteamMetadata(game.appId, game.id)
    } else if (game.store === 'epic' && game.appId) {
      meta = await fetchEpicMetadata(
        game.appId,
        game.name,
        game.id,
        (game as Game & { _catalogNamespace?: string })._catalogNamespace
      )
    } else if (game.store === 'ea') {
      meta = await fetchEaMetadata(game.appId ?? game.name, game.name, game.id)
    }

    // If primary source had no description, supplement with IGDB
    if (!meta || !meta.description) {
      const igdb = await fetchIgdbMetadata(game.name, game.id)
      if (igdb) {
        // Merge: keep store-specific data if present, supplement with IGDB
        meta = meta
          ? {
              ...igdb,
              ...meta,
              // Use IGDB fields only where our primary source had nothing
              description: meta.description ?? igdb.description,
              shortDescription: meta.shortDescription ?? igdb.shortDescription,
              screenshots: meta.screenshots?.length ? meta.screenshots : igdb.screenshots,
              genres: meta.genres?.length ? meta.genres : igdb.genres,
              developer: meta.developer ?? igdb.developer,
              publisher: meta.publisher ?? igdb.publisher,
              releaseDate: meta.releaseDate ?? igdb.releaseDate,
              igdbRating: igdb.igdbRating,
              igdbRatingCount: igdb.igdbRatingCount
            }
          : igdb
      }
    }
  } catch (e) {
    console.error(`[metadata] failed for ${game.name}:`, e)
  }

  if (meta) metadataCache.set(game.id, meta)
  return meta
}
