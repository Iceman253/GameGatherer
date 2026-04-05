import { execSync } from 'child_process'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { parseVdf } from './vdf'
import { STEAM_APPID_OVERRIDES } from '../metadata/crossStore'
import type { Game } from '../../shared/types'

function regQuery(keyPath: string, valueName: string): string | null {
  try {
    const out = execSync(`reg query "${keyPath}" /v "${valueName}"`, {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const match = out.match(/REG_\w+\s+(.+)/)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

function getSteamRoot(): string | null {
  return (
    regQuery('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath') ??
    regQuery('HKCU\\Software\\Valve\\Steam', 'SteamPath') ??
    null
  )
}

function getLibraryPaths(steamRoot: string): string[] {
  const paths: string[] = [join(steamRoot, 'steamapps')]

  const vdfPath = join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  if (!existsSync(vdfPath)) return paths

  try {
    const raw = readFileSync(vdfPath, 'utf8')
    const parsed = parseVdf(raw)

    const root =
      (parsed['libraryfolders'] as Record<string, unknown>) ??
      (parsed['LibraryFolders'] as Record<string, unknown>)

    if (!root) return paths

    for (const key of Object.keys(root)) {
      if (!/^\d+$/.test(key)) continue
      const entry = root[key]
      const libPath =
        typeof entry === 'string'
          ? entry
          : (entry as Record<string, string>)?.path

      if (libPath && existsSync(libPath)) {
        paths.push(join(libPath, 'steamapps'))
      }
    }
  } catch { /* return what we have */ }

  return paths
}

export function detectSteamGames(): Game[] {
  const steamRoot = getSteamRoot()
  if (!steamRoot || !existsSync(steamRoot)) return []

  const libraryPaths = getLibraryPaths(steamRoot)
  const games: Game[] = []

  for (const libPath of libraryPaths) {
    if (!existsSync(libPath)) continue

    let entries: string[]
    try {
      entries = readdirSync(libPath)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.startsWith('appmanifest_') || !entry.endsWith('.acf')) continue

      try {
        const raw = readFileSync(join(libPath, entry), 'utf8')
        const parsed = parseVdf(raw)
        const state = parsed['AppState'] as Record<string, string> | undefined
        if (!state) continue

        // Case-insensitive ACF key lookup (Steam versions occasionally differ in casing)
        const ci = (key: string): string | undefined => {
          const lower = key.toLowerCase()
          const found = Object.keys(state).find((k) => k.toLowerCase() === lower)
          return found ? String(state[found]) : undefined
        }

        const appId = ci('appid') ?? ''
        const name = ci('name') ?? ''
        const installDir = ci('installdir') ?? ''

        if (!appId || !name || !installDir) continue
        if (name.toLowerCase().includes('redistributable')) continue
        if (name.toLowerCase().includes('soundtrack')) continue

        const playtimeRaw = ci('playtime_forever')
        const playtime = playtimeRaw !== undefined ? Number(playtimeRaw) : undefined

        // LastPlayed is a Unix timestamp (seconds). 0 = never played.
        const lastPlayedStr = ci('lastplayed') ?? ci('LastPlayed')
        const lastPlayedRaw = lastPlayedStr ? Number(lastPlayedStr) : undefined
        const lastPlayed = lastPlayedRaw && lastPlayedRaw > 0 ? lastPlayedRaw : undefined

        // Apply cross-store override if this AppID belongs to another store
        const overrideStore = STEAM_APPID_OVERRIDES[appId]

        // For Rocket League and other Epic-classified games, try their store's cover art too
        let coverArtUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`

        games.push({
          id: `steam_${appId}`,
          name,
          store: overrideStore ?? 'steam',
          installPath: join(libPath, 'common', installDir),
          coverArtUrl,
          appId,
          playtimeMinutes: playtime,
          lastPlayed,
          isInstalled: true
        })
      } catch { /* skip malformed manifest */ }
    }
  }

  return games
}
