import { ipcMain, BrowserWindow, dialog } from 'electron'
import { readFileSync } from 'fs'
import { get as httpsGet } from 'https'
import { get as httpGet } from 'http'
import { IPC_CHANNELS } from './channels'
import { aggregateGames, enrichEpicCoverArt } from '../detectors/index'
import { launchGame, openStorePage } from '../launcher'
import { getGameMetadata } from '../metadata/fetcher'
import { readConfig, writeConfig, testIgdbCredentials } from '../config'
import { testSteamCredentials } from '../metadata/steamApiLib'
import { scrapeSteamByUrl } from '../metadata/steamMeta'
import { scrapeEaByUrl } from '../metadata/eaMeta'
import type { Game, GameMetadata } from '../../shared/types'

export function registerIpcHandlers(win: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.GET_GAMES, async () => {
    const result = await aggregateGames()

    enrichEpicCoverArt(result.games, (id, url) => {
      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.COVER_UPDATE, id, url)
    })

    return result
  })

  ipcMain.handle(IPC_CHANNELS.REFRESH_GAMES, async () => {
    const result = await aggregateGames()
    enrichEpicCoverArt(result.games, (id, url) => {
      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.COVER_UPDATE, id, url)
    })
    return result
  })

  ipcMain.handle(IPC_CHANNELS.GET_METADATA, async (_event, game: Game, forceRefresh = false) => {
    const meta = await getGameMetadata(game, forceRefresh)

    // If metadata reveals a different store (cross-store attribution), notify renderer
    if (meta?.realStore && meta.realStore !== game.store) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.STORE_RECLASSIFY, game.id, meta.realStore)
      }
    }

    // Push EA cover art update (Origin CDN URL resolved during metadata fetch)
    if (meta?.coverArtUrl && game.store === 'ea') {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.COVER_UPDATE, game.id, meta.coverArtUrl)
      }
    }

    return meta
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCH_GAME, (_event, game: Game) => {
    return launchGame(game)
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_STORE_PAGE, (_event, game: Game) => {
    openStorePage(game)
  })

  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, () => {
    return readConfig()
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_CONFIG, (_event, config) => {
    writeConfig(config)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.TEST_IGDB, async (_event, clientId: string, clientSecret: string) => {
    return testIgdbCredentials(clientId, clientSecret)
  })

  ipcMain.handle(IPC_CHANNELS.TEST_STEAM, async (_event, apiKey: string, steamId: string) => {
    return testSteamCredentials(apiKey, steamId)
  })

  ipcMain.handle(IPC_CHANNELS.HIDE_GAME, (_event, id: string) => {
    const cfg = readConfig()
    const hidden = new Set(cfg.hiddenGameIds ?? [])
    hidden.add(id)
    writeConfig({ ...cfg, hiddenGameIds: [...hidden] })
  })

  ipcMain.handle(IPC_CHANNELS.UNHIDE_GAME, (_event, id: string) => {
    const cfg = readConfig()
    const hidden = (cfg.hiddenGameIds ?? []).filter((h) => h !== id)
    writeConfig({ ...cfg, hiddenGameIds: hidden })
  })

  ipcMain.handle(IPC_CHANNELS.PICK_THUMBNAIL, async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose thumbnail image',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    // Return a data URL so the renderer can display it regardless of protocol restrictions
    const filePath = result.filePaths[0]
    const ext = filePath.split('.').pop()?.toLowerCase() ?? 'jpeg'
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp'
    }
    const mime = mimeMap[ext] ?? 'image/jpeg'
    const data = readFileSync(filePath).toString('base64')
    return `data:${mime};base64,${data}`
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_APPLY_SIZE, (_event, width: number, height: number) => {
    if (!win.isDestroyed()) win.setSize(Math.round(width), Math.round(height), true)
  })

  ipcMain.handle(IPC_CHANNELS.FETCH_STORE_DESC, async (_event, url: string, gameId: string) => {
    // EA store URL → scrape the page for the full description
    if (/\bea\.com\//i.test(url)) {
      return scrapeEaByUrl(url, gameId)
    }

    // Steam store URL → scrape the page directly for the full "About the Game" section
    if (/store\.steampowered\.com\/app\//i.test(url)) {
      return scrapeSteamByUrl(url, gameId)
    }

    // Anything else → grab the og:description / meta description from the page
    const desc = await fetchPageDescription(url)
    if (!desc) return null
    return { gameId, description: desc, shortDescription: desc.slice(0, 200) + (desc.length > 200 ? '…' : '') } satisfies GameMetadata
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    if (!win.isDestroyed()) win.minimize()
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (!win.isDestroyed()) win.isMaximized() ? win.unmaximize() : win.maximize()
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    if (!win.isDestroyed()) win.close()
  })
}

// Fetch a store page URL and extract the first non-empty meta description / og:description.
function fetchPageDescription(url: string, redirectsLeft = 5): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const getter = url.startsWith('https') ? httpsGet : httpGet
      const req = getter(
        url,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GameGatherer/1.0' }, timeout: 12000 },
        (res) => {
          // Follow redirects
          if (
            res.statusCode &&
            res.statusCode >= 300 && res.statusCode < 400 &&
            res.headers.location &&
            redirectsLeft > 0
          ) {
            res.resume()
            const next = res.headers.location.startsWith('http')
              ? res.headers.location
              : new URL(res.headers.location, url).toString()
            resolve(fetchPageDescription(next, redirectsLeft - 1))
            return
          }

          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            res.resume(); resolve(null); return
          }

          let html = ''
          res.setEncoding('utf8')
          // Stop collecting once we have the <head> — descriptions are always there
          res.on('data', (chunk: string) => {
            html += chunk
            if (html.length > 200_000 || html.includes('</head>')) res.destroy()
          })
          res.on('close', () => resolve(extractMetaDescription(html)))
          res.on('end', () => resolve(extractMetaDescription(html)))
        }
      )
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
    } catch {
      resolve(null)
    }
  })
}

function extractMetaDescription(html: string): string | null {
  // Try og:description first (usually richer), then name="description"
  const patterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
  ]
  for (const re of patterns) {
    const match = html.match(re)
    const text = match?.[1]?.trim()
    if (text && text.length > 10) {
      // Decode common HTML entities
      return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
    }
  }
  return null
}
