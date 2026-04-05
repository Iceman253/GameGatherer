/**
 * IGDB metadata source (optional).
 *
 * Requires a Twitch developer app. To enable:
 * Create %APPDATA%\GameGatherer\config.json with:
 *   { "igdb": { "clientId": "...", "clientSecret": "..." } }
 *
 * Free tier allows 4 requests/second and ~500 requests/month.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { fetchJson, postForm } from './http'
import type { GameMetadata, StoreRating } from '../../shared/types'

interface IgdbConfig { clientId: string; clientSecret: string }
interface AppConfig { igdb?: IgdbConfig }

interface IgdbTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

interface IgdbGame {
  id: number
  name: string
  summary?: string
  cover?: { image_id: string }
  genres?: { name: string }[]
  first_release_date?: number
  involved_companies?: Array<{
    developer: boolean
    publisher: boolean
    company: { name: string }
  }>
  rating?: number
  rating_count?: number
  screenshots?: { image_id: string }[]
  websites?: { url: string; category: number }[]
}

// Simple in-process token cache
let _tokenCache: { token: string; expiresAt: number } | null = null

function getIgdbConfig(): IgdbConfig | null {
  try {
    const configPath = join(app.getPath('userData'), 'config.json')
    if (!existsSync(configPath)) return null
    const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as AppConfig
    if (cfg.igdb?.clientId && cfg.igdb?.clientSecret) return cfg.igdb
  } catch { /* ignore */ }
  return null
}

async function getIgdbToken(config: IgdbConfig): Promise<string | null> {
  const now = Date.now()
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) return _tokenCache.token

  const res = await postForm<IgdbTokenResponse>(
    'https://id.twitch.tv/oauth2/token',
    {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'client_credentials'
    }
  )
  if (!res?.access_token) return null
  _tokenCache = { token: res.access_token, expiresAt: now + res.expires_in * 1000 }
  return res.access_token
}

function igdbImageUrl(imageId: string, size: 'cover_big' | 'screenshot_big' = 'cover_big'): string {
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`
}

export async function fetchIgdbMetadata(gameName: string, gameId: string): Promise<GameMetadata | null> {
  const config = getIgdbConfig()
  if (!config) return null

  const token = await getIgdbToken(config)
  if (!token) return null

  const query = `search "${gameName.replace(/"/g, '')}"; fields name,summary,cover.image_id,genres.name,first_release_date,involved_companies.developer,involved_companies.publisher,involved_companies.company.name,rating,rating_count,screenshots.image_id,websites.url,websites.category; limit 1;`

  const results = await fetchJson<IgdbGame[]>(
    'https://api.igdb.com/v4/games',
    {
      'Client-ID': config.clientId,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain'
    }
  )

  // IGDB GET doesn't support body; need POST. Use custom fetch:
  const games = await postIgdbQuery<IgdbGame[]>(config, token, 'games', query)
  if (!games?.length) return null

  const g = games[0]

  const developers = (g.involved_companies ?? [])
    .filter((ic) => ic.developer)
    .map((ic) => ic.company.name)

  const publishers = (g.involved_companies ?? [])
    .filter((ic) => ic.publisher)
    .map((ic) => ic.company.name)

  const screenshots = (g.screenshots ?? [])
    .map((s) => igdbImageUrl(s.image_id, 'screenshot_big'))
    .slice(0, 12)

  let rating: StoreRating | undefined
  if (g.rating != null && g.rating_count) {
    rating = {
      score: Math.round(g.rating),
      label: `IGDB ${Math.round(g.rating)}/100`,
      reviewCount: g.rating_count,
      format: 'igdb'
    }
  }

  const officialSite = g.websites?.find((w) => w.category === 1)?.url

  return {
    gameId,
    description: g.summary,
    shortDescription: g.summary ? g.summary.slice(0, 200) + (g.summary.length > 200 ? '…' : '') : undefined,
    releaseDate: g.first_release_date
      ? new Date(g.first_release_date * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : undefined,
    developer: developers.join(', ') || undefined,
    publisher: publishers.join(', ') || undefined,
    genres: g.genres?.map((gn) => gn.name),
    screenshots,
    headerImage: g.cover ? igdbImageUrl(g.cover.image_id, 'screenshot_big') : screenshots[0],
    igdbRating: g.rating != null ? Math.round(g.rating) : undefined,
    igdbRatingCount: g.rating_count,
    rating,
    website: officialSite
  }
}

// IGDB API requires POST with text/plain body
function postIgdbQuery<T>(
  config: IgdbConfig,
  token: string,
  endpoint: string,
  query: string
): Promise<T | null> {
  return new Promise((resolve) => {
    const { request } = require('https') as typeof import('https')
    const bodyBuf = Buffer.from(query, 'utf8')
    const req = request(
      {
        hostname: 'api.igdb.com',
        port: 443,
        path: `/v4/${endpoint}`,
        method: 'POST',
        headers: {
          'Client-ID': config.clientId,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
          'Content-Length': bodyBuf.length,
          'User-Agent': 'GameGatherer/1.0'
        },
        timeout: 10000
      },
      (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume(); resolve(null); return
        }
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c: string) => { body += c })
        res.on('end', () => { try { resolve(JSON.parse(body) as T) } catch { resolve(null) } })
      }
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.write(bodyBuf)
    req.end()
  })
}
