/**
 * Steam Web API helpers.
 * Used to pull playtime + last-played for games in the user's Steam library,
 * including EA/Epic games that happen to be installed through Steam.
 */

import { fetchJson } from './http'

interface SteamVanityResponse {
  response?: { steamid?: string; success?: number }
}

interface SteamGame {
  appid: number
  name?: string
  playtime_forever?: number   // minutes
  rtime_last_played?: number  // unix timestamp (seconds)
}

interface SteamOwnedGamesResponse {
  response?: { game_count?: number; games?: SteamGame[] }
}

export interface SteamLibraryEntry {
  appId: string
  playtimeMinutes: number
  lastPlayed?: number   // unix timestamp seconds
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Resolve a Steam vanity URL (username) to a 64-bit Steam ID string. */
export async function resolveSteamVanityUrl(apiKey: string, vanity: string): Promise<string | null> {
  const encoded = encodeURIComponent(vanity)
  const data = await fetchJson<SteamVanityResponse>(
    `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${encoded}`
  )
  if (data?.response?.success === 1 && data.response.steamid) return data.response.steamid
  return null
}

/** Test credentials. Accepts either a 64-bit Steam ID or a vanity username. */
export async function testSteamCredentials(
  apiKey: string,
  steamIdOrVanity: string
): Promise<{ ok: boolean; error?: string; resolvedId?: string }> {
  if (!apiKey.trim() || !steamIdOrVanity.trim())
    return { ok: false, error: 'API key and Steam ID are required.' }

  let steamId = steamIdOrVanity.trim()

  // If it doesn't look like a 64-bit Steam ID (17-digit number starting with 7656), resolve it
  if (!/^7656\d{13}$/.test(steamId)) {
    const resolved = await resolveSteamVanityUrl(apiKey, steamId)
    if (!resolved) return { ok: false, error: `Could not find Steam account "${steamId}". Check the username or use your 64-bit Steam ID.` }
    steamId = resolved
  }

  const data = await fetchJson<SteamOwnedGamesResponse>(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true&format=json`
  )

  if (!data?.response) return { ok: false, error: 'Invalid API key or Steam ID is private. Make sure your Steam profile and game details are set to Public.' }
  if (data.response.game_count == null) return { ok: false, error: 'Steam profile is private. Set your Game Details to Public in Steam privacy settings.' }

  return { ok: true, resolvedId: steamId }
}

/**
 * Fetch the full Steam library for a user.
 * Returns a map keyed by BOTH normalised game name AND appid string for fast lookup.
 */
export async function fetchSteamLibrary(
  apiKey: string,
  steamId: string
): Promise<Map<string, SteamLibraryEntry> | null> {
  const data = await fetchJson<SteamOwnedGamesResponse>(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true&format=json`
  )

  const games = data?.response?.games
  if (!games?.length) return null

  const map = new Map<string, SteamLibraryEntry>()
  for (const g of games) {
    const entry: SteamLibraryEntry = {
      appId: String(g.appid),
      playtimeMinutes: g.playtime_forever ?? 0,
      lastPlayed: g.rtime_last_played && g.rtime_last_played > 0 ? g.rtime_last_played : undefined
    }
    // Index by appid
    map.set(String(g.appid), entry)
    // Index by normalised name (only if name is available)
    if (g.name) map.set(normalizeName(g.name), entry)
  }
  return map
}

export { normalizeName }
