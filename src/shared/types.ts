export type GameStore = 'steam' | 'epic' | 'ea'

export interface Game {
  id: string
  name: string
  store: GameStore
  installPath: string
  executablePath?: string
  coverArtUrl?: string
  playtimeMinutes?: number
  lastPlayed?: number   // Unix timestamp (seconds)
  appId?: string
  isInstalled: boolean
}

export interface StoreRating {
  score?: number           // 0–100 normalized
  label?: string           // "Overwhelmingly Positive", "T for Teen", "PEGI 16"
  reviewCount?: number
  positiveCount?: number
  format: 'steam_reviews' | 'metacritic' | 'esrb' | 'pegi' | 'igdb' | 'none'
}

export interface GameMetadata {
  gameId: string
  description?: string
  shortDescription?: string
  releaseDate?: string
  developer?: string
  publisher?: string
  genres?: string[]
  tags?: string[]
  screenshots?: string[]
  headerImage?: string
  rating?: StoreRating
  igdbRating?: number
  igdbRatingCount?: number
  website?: string
  realStore?: GameStore        // set if cross-store attribution changed the store
  coverArtUrl?: string         // cover art URL to push to the game tile (EA metadata)
  playtimeMinutes?: number     // playtime from EA ISS when not available at detect-time
  lastPlayed?: number          // last-played Unix timestamp from EA ISS
}

export interface Collection {
  id: string
  name: string
  gameIds: string[]   // ordered list of game IDs in this collection
}

export interface DetectionResult {
  games: Game[]
  errors: string[]
}

export interface AppConfig {
  igdb?: { clientId: string; clientSecret: string }
  steam?: { apiKey: string; steamId: string }
  hiddenGameIds?: string[]
  tileSize?: 'small' | 'medium' | 'large'
  customCovers?: Record<string, string>   // gameId → data URL
  gameOrder?: string[]                    // ordered array of game IDs (includes collection IDs)
  windowSizes?: {
    small?: { width: number; height: number }
    medium?: { width: number; height: number }
    large?: { width: number; height: number }
  }
  collections?: Collection[]
  gameStoreUrls?: Record<string, string>  // gameId → store page URL for auto-fetch
}

export interface ElectronAPI {
  getGames: () => Promise<DetectionResult>
  launchGame: (game: Game) => Promise<{ success: boolean; error?: string }>
  openStorePage: (game: Game) => void
  refreshGames: () => Promise<DetectionResult>
  updateGameCover: (id: string, url: string) => void
  onCoverUpdate: (callback: (id: string, url: string) => void) => () => void
  getMetadata: (game: Game, forceRefresh?: boolean) => Promise<GameMetadata | null>
  onStoreReclassify: (callback: (id: string, store: GameStore) => void) => () => void
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<{ ok: boolean }>
  testIgdb: (clientId: string, clientSecret: string) => Promise<{ ok: boolean; error?: string }>
  testSteam: (apiKey: string, steamId: string) => Promise<{ ok: boolean; error?: string; resolvedId?: string }>
  hideGame: (id: string) => Promise<void>
  unhideGame: (id: string) => Promise<void>
  pickThumbnail: () => Promise<string | null>
  applyWindowSize: (width: number, height: number) => void
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
  fetchStoreDescription: (url: string, gameId: string) => Promise<GameMetadata | null>
}
