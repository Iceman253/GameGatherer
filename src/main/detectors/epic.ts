import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { Game } from '../../shared/types'

const MANIFESTS_DIR =
  'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'

// Categories that indicate non-game installs
const SKIP_CATEGORIES = new Set([
  'applications/redistributable',
  'unreal',
  'games/edition/base' // engine components
])

interface EpicManifest {
  bIsApplication?: boolean
  AppName?: string
  DisplayName?: string
  InstallLocation?: string
  LaunchExecutable?: string
  CatalogNamespace?: string
  CatalogItemId?: string
  AppCategories?: string[]
}

export function detectEpicGames(): Game[] {
  if (!existsSync(MANIFESTS_DIR)) return []

  let files: string[]
  try {
    files = readdirSync(MANIFESTS_DIR).filter((f) => f.endsWith('.item'))
  } catch {
    return []
  }

  const games: Game[] = []

  for (const file of files) {
    try {
      const raw = readFileSync(join(MANIFESTS_DIR, file), 'utf8')
      const manifest: EpicManifest = JSON.parse(raw)

      if (!manifest.bIsApplication) continue
      if (!manifest.DisplayName || !manifest.AppName) continue

      // Skip redistributables and engine components
      const categories = manifest.AppCategories ?? []
      if (categories.some((c) => SKIP_CATEGORIES.has(c.toLowerCase()))) continue

      const installPath = manifest.InstallLocation ?? ''
      const exePath =
        manifest.LaunchExecutable && installPath
          ? join(installPath, manifest.LaunchExecutable)
          : undefined

      games.push({
        id: `epic_${manifest.AppName}`,
        name: manifest.DisplayName,
        store: 'epic',
        installPath,
        executablePath: exePath,
        coverArtUrl: undefined, // enriched asynchronously after detection
        appId: manifest.AppName,
        isInstalled: true,
        // Store namespace for cover art enrichment
        ...({ _catalogNamespace: manifest.CatalogNamespace } as object)
      })
    } catch {
      // Skip malformed manifest
    }
  }

  return games
}

// Fetch cover art for Epic games via the public Epic store API.
// Called in the background after initial game list is returned.
export async function fetchEpicCoverUrl(
  catalogNamespace: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const url = `https://store-content.ak.epicgames.com/api/en-US/content/products/${catalogNamespace}`

    import('https')
      .then(({ get }) => {
        const req = get(url, { timeout: 8000 }, (res) => {
          if (res.statusCode !== 200) {
            res.resume()
            resolve(null)
            return
          }

          let body = ''
          res.setEncoding('utf8')
          res.on('data', (chunk: string) => { body += chunk })
          res.on('end', () => {
            try {
              const data = JSON.parse(body)
              // Navigate: data.pages[0].data.about.images or keyImages
              const pages = data?.pages ?? []
              for (const page of pages) {
                const images: Array<{ type: string; url: string }> =
                  page?.data?.about?.keyImages ?? []
                const tall = images.find(
                  (img) =>
                    img.type === 'DieselGameBoxTall' ||
                    img.type === 'Thumbnail'
                )
                if (tall?.url) {
                  resolve(tall.url)
                  return
                }
              }
              resolve(null)
            } catch {
              resolve(null)
            }
          })
        })

        req.on('error', () => resolve(null))
        req.on('timeout', () => { req.destroy(); resolve(null) })
      })
      .catch(() => resolve(null))
  })
}
