import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { app, safeStorage } from 'electron'
import { postForm } from './metadata/http'

// ── Credential encryption via OS-native secure storage ────────────────────────
// Windows: DPAPI  |  macOS: Keychain  |  Linux: libsecret
// Encrypted values are stored as base64 strings in config.json.
// Plaintext values (from before this was added) are transparently migrated on
// the next write.

function encryptField(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) return value
  return safeStorage.encryptString(value).toString('base64')
}

function decryptField(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) return value
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    // Value was stored as plaintext (pre-encryption migration) — return as-is
    return value
  }
}

function decryptCredentials(cfg: AppConfig): AppConfig {
  const out = { ...cfg }
  if (out.igdb) {
    out.igdb = {
      clientId: decryptField(out.igdb.clientId),
      clientSecret: decryptField(out.igdb.clientSecret)
    }
  }
  if (out.steam) {
    out.steam = {
      apiKey: decryptField(out.steam.apiKey),
      steamId: decryptField(out.steam.steamId)
    }
  }
  return out
}

function encryptCredentials(cfg: AppConfig): AppConfig {
  const out = { ...cfg }
  if (out.igdb) {
    out.igdb = {
      clientId: encryptField(out.igdb.clientId),
      clientSecret: encryptField(out.igdb.clientSecret)
    }
  }
  if (out.steam) {
    out.steam = {
      apiKey: encryptField(out.steam.apiKey),
      steamId: encryptField(out.steam.steamId)
    }
  }
  return out
}

export interface AppConfig {
  igdb?: { clientId: string; clientSecret: string }
  steam?: { apiKey: string; steamId: string }
  hiddenGameIds?: string[]
  tileSize?: 'small' | 'medium' | 'large'
  customCovers?: Record<string, string>
  gameOrder?: string[]
  windowSizes?: {
    small?: { width: number; height: number }
    medium?: { width: number; height: number }
    large?: { width: number; height: number }
  }
  collections?: Array<{ id: string; name: string; gameIds: string[] }>
  gameStoreUrls?: Record<string, string>
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function readConfig(): AppConfig {
  try {
    const p = configPath()
    if (!existsSync(p)) return {}
    const raw = JSON.parse(readFileSync(p, 'utf8')) as AppConfig
    return decryptCredentials(raw)
  } catch {
    return {}
  }
}

export function writeConfig(config: AppConfig): void {
  const p = configPath()
  const dir = dirname(p)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const encrypted = encryptCredentials(config)
  writeFileSync(p, JSON.stringify(encrypted, null, 2), 'utf8')
}

interface TwitchTokenResponse {
  access_token?: string
  expires_in?: number
  token_type?: string
  message?: string
}

export async function testIgdbCredentials(
  clientId: string,
  clientSecret: string
): Promise<{ ok: boolean; error?: string }> {
  if (!clientId.trim() || !clientSecret.trim()) {
    return { ok: false, error: 'Client ID and Secret are required.' }
  }

  // Step 1: get a token from Twitch
  const tokenRes = await postForm<TwitchTokenResponse>(
    'https://id.twitch.tv/oauth2/token',
    {
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      grant_type: 'client_credentials'
    }
  )

  if (!tokenRes?.access_token) {
    const msg = tokenRes?.message ?? 'Invalid credentials — check your Client ID and Secret.'
    return { ok: false, error: msg }
  }

  // Step 2: make a test IGDB query
  const { request } = await import('https')
  const testOk = await new Promise<boolean>((resolve) => {
    const body = Buffer.from('fields name; limit 1; where id = 1;', 'utf8')
    const req = request(
      {
        hostname: 'api.igdb.com',
        port: 443,
        path: '/v4/games',
        method: 'POST',
        headers: {
          'Client-ID': clientId.trim(),
          Authorization: `Bearer ${tokenRes.access_token}`,
          'Content-Type': 'text/plain',
          'Content-Length': body.length,
          'User-Agent': 'GameGatherer/1.0'
        },
        timeout: 8000
      },
      (res) => {
        res.resume()
        resolve(res.statusCode === 200)
      }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.write(body)
    req.end()
  })

  if (!testOk) {
    return { ok: false, error: 'Credentials valid but IGDB query failed. Try again.' }
  }

  return { ok: true }
}
