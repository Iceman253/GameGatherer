import { execSync } from 'child_process'
import { readdirSync, statSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Game } from '../../shared/types'

// Pattern that identifies Origin/EA offer IDs (e.g. "Origin.OFR.50.0000166", "OFB-EAST:48217")
const OFFER_ID_RE = /^(Origin\.|OFB-)/i

// Read the DiPManifest installerdata.xml that EA Desktop writes into every game's install dir.
// Returns the offer ID (contentID), base slug, and canonical title when available.
function readInstallerData(installDir: string): { offerId?: string; slug?: string; title?: string } {
  // EA places the manifest at <install>/__Installer/installerdata.xml
  // Some older games nest it one level deeper: <install>/__Installer/<offerId>/installerdata.xml
  const candidates: string[] = [join(installDir, '__Installer', 'installerdata.xml')]
  try {
    const subDir = join(installDir, '__Installer')
    if (existsSync(subDir)) {
      for (const entry of readdirSync(subDir)) {
        const nested = join(subDir, entry, 'installerdata.xml')
        if (existsSync(nested)) candidates.push(nested)
      }
    }
  } catch { /* ignore */ }

  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      const xml = readFileSync(p, 'utf8')
      const offerId = xml.match(/<contentID>([^<]+)<\/contentID>/)?.[1]?.trim()
      const slug = xml.match(/<baseSlug>([^<]+)<\/baseSlug>/)?.[1]?.trim()
      const title = xml.match(/<gameTitle[^>]*locale="en_US"[^>]*>([^<]+)<\/gameTitle>/)?.[1]?.trim()
        ?? xml.match(/<gameTitle[^>]*>([^<]+)<\/gameTitle>/)?.[1]?.trim()
      if (offerId || slug || title) return { offerId, slug, title }
    } catch { continue }
  }
  return {}
}

// Executables to ignore when finding the game's main binary
const IGNORE_EXE_PATTERNS = [
  /^unins/i,
  /^vcredist/i,
  /^dxsetup/i,
  /^directx/i,
  /^crashpad/i,
  /^crashreport/i,
  /^__installer/i,
  /^eadm/i,
  /setup/i,
  /install/i,
  /redist/i
]

// Registry subkey names / display names / folder names that are EA infrastructure,
// not actual games. Checked case-insensitively against both the registry key and
// the resolved DisplayName value.
const EA_NON_GAME_PATTERNS = [
  /^ea\s*desktop/i,
  /^ea\s*app/i,
  /^electronic\s*arts\s*desktop/i,
  /^eadesktop/i,
  /^origin$/i,
  /^origin\s*client/i,
  /^ea\s*download\s*manager/i,
  /^eadm$/i,
  /^ea\s*anti[- ]?cheat/i,
  /^ea\s*launcher/i,
  /^bonjour/i,          // sometimes registered by EA installers
  /redistributable/i,
  /^microsoft\s*visual\s*c\+\+/i,
  /^directx/i,
]

function isNonGame(name: string): boolean {
  return EA_NON_GAME_PATTERNS.some((p) => p.test(name))
}

function queryRegistrySubkeys(keyPath: string): string[] {
  try {
    const out = execSync(`reg query "${keyPath}"`, {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.toUpperCase().startsWith('HKEY_'))
      .map((l) => {
        const parts = l.split('\\')
        return parts[parts.length - 1] ?? ''
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function queryRegistryValue(keyPath: string, valueName: string): string | null {
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

function findGameExecutable(installPath: string): string | undefined {
  if (!existsSync(installPath)) return undefined

  let entries: string[]
  try {
    entries = readdirSync(installPath)
  } catch {
    return undefined
  }

  const exes = entries
    .filter((f) => f.toLowerCase().endsWith('.exe'))
    .filter((f) => !IGNORE_EXE_PATTERNS.some((p) => p.test(f)))
    .map((f) => join(installPath, f))

  if (exes.length === 0) return undefined
  if (exes.length === 1) return exes[0]

  // Pick the largest .exe (most likely the game binary)
  return exes.sort((a, b) => {
    try {
      return statSync(b).size - statSync(a).size
    } catch {
      return 0
    }
  })[0]
}

function detectFromRegistry(): Game[] {
  const games: Game[] = []
  const registryBases = [
    'HKLM\\SOFTWARE\\WOW6432Node\\Electronic Arts',
    'HKLM\\SOFTWARE\\Electronic Arts',
    'HKLM\\SOFTWARE\\WOW6432Node\\Origin Games',
    'HKLM\\SOFTWARE\\Origin Games'
  ]

  for (const base of registryBases) {
    const subkeys = queryRegistrySubkeys(base)

    for (const gameKey of subkeys) {
      // Skip known EA infrastructure entries by registry key name
      if (isNonGame(gameKey)) continue

      const fullKey = `${base}\\${gameKey}`

      const installDir =
        queryRegistryValue(fullKey, 'Install Dir') ??
        queryRegistryValue(fullKey, 'InstallLocation') ??
        queryRegistryValue(fullKey, 'InstallDir')

      if (!installDir) continue

      const displayName =
        queryRegistryValue(fullKey, 'DisplayName') ?? gameKey

      // Also skip if the resolved display name looks like infrastructure
      if (isNonGame(displayName)) continue

      // Try to get the canonical offer ID from the game's installerdata.xml.
      // For games registered under "Origin Games" the key name itself is usually the offer ID.
      const installer = readInstallerData(installDir)
      const offerIdFromKey = OFFER_ID_RE.test(gameKey) ? gameKey : undefined
      const resolvedOfferId = installer.offerId ?? offerIdFromKey

      const exePath = findGameExecutable(installDir)
      const safeId = gameKey.replace(/[^a-zA-Z0-9_-]/g, '_')

      games.push({
        id: `ea_${safeId}`,
        name: installer.title ?? displayName,
        store: 'ea',
        installPath: installDir,
        executablePath: exePath,
        appId: resolvedOfferId ?? gameKey,
        isInstalled: true
      })
    }
  }

  return games
}

function detectFromFilesystem(): Game[] {
  const games: Game[] = []
  const searchPaths = [
    'C:\\Program Files\\EA Games',
    'C:\\Program Files (x86)\\EA Games',
    'C:\\Program Files\\Electronic Arts',
    'C:\\Program Files (x86)\\Electronic Arts'
  ]

  for (const base of searchPaths) {
    if (!existsSync(base)) continue

    let entries: string[]
    try {
      entries = readdirSync(base)
    } catch {
      continue
    }

    for (const dir of entries) {
      // Skip known EA infrastructure folders
      if (isNonGame(dir)) continue

      const fullPath = join(base, dir)
      try {
        if (!statSync(fullPath).isDirectory()) continue
      } catch {
        continue
      }

      const installer = readInstallerData(fullPath)
      const exePath = findGameExecutable(fullPath)
      const safeId = dir.replace(/[^a-zA-Z0-9_-]/g, '_')

      games.push({
        id: `ea_fs_${safeId}`,
        name: installer.title ?? dir,
        store: 'ea',
        installPath: fullPath,
        executablePath: exePath,
        appId: installer.offerId ?? dir,
        isInstalled: true
      })
    }
  }

  return games
}

export function detectEaGames(): Game[] {
  const fromRegistry = detectFromRegistry()

  if (fromRegistry.length > 0) return fromRegistry

  // Fallback to filesystem scan if registry yielded nothing
  return detectFromFilesystem()
}
