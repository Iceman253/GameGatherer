import type { GameStore } from '../../shared/types'

// Steam AppID → real store override.
// Games sold or installable via Steam that actually belong to another store.
export const STEAM_APPID_OVERRIDES: Record<string, GameStore> = {
  // ── Epic Games / Psyonix ─────────────────────────────
  '252950': 'epic',    // Rocket League (Epic acquired Psyonix 2019)

  // ── Electronic Arts ──────────────────────────────────
  // Star Wars
  '1172380': 'ea',     // Star Wars Jedi: Fallen Order
  '1868140': 'ea',     // Star Wars Jedi: Survivor
  // Apex Legends
  '1172470': 'ea',     // Apex Legends
  // Titanfall
  '1237950': 'ea',     // Titanfall 2
  // Battlefield
  '1238810': 'ea',     // Battlefield 2042
  '1048390': 'ea',     // Battlefield V
  '888050':  'ea',     // Battlefield 1
  '24960':   'ea',     // Battlefield 2
  '24980':   'ea',     // Battlefield: Bad Company 2
  // Mass Effect
  '1328670': 'ea',     // Mass Effect Legendary Edition
  '17460':   'ea',     // Mass Effect
  // Dragon Age
  '47810':   'ea',     // Dragon Age: Origins
  '1222690': 'ea',     // Dragon Age: The Veilguard
  // Need for Speed
  '1262540': 'ea',     // NFS Heat
  '1091510': 'ea',     // NFS Unbound
  // Mirror's Edge
  '17410':   'ea',     // Mirror's Edge
  '656460':  'ea',     // Mirror's Edge Catalyst
  // Dead Space
  '1693980': 'ea',     // Dead Space (2023 Remake)
  '17470':   'ea',     // Dead Space (2008)
  // It Takes Two
  '1426210': 'ea',     // It Takes Two
  // A Way Out
  '753640':  'ea',     // A Way Out
  // Unravel
  '456790':  'ea',     // Unravel
  '532210':  'ea',     // Unravel Two
  // Fe
  '694070':  'ea',     // Fe
  // Sea of Solitude
  '1132820': 'ea',     // Sea of Solitude
  // FC / FIFA
  '1574050': 'ea',     // EA Sports FC 24
  '2195250': 'ea',     // EA Sports FC 25
  // Sims 4
  '1222670': 'ea',     // The Sims 4 (free-to-play on Steam)
  // Plants vs Zombies
  '3590':    'ea',     // Plants vs. Zombies GOTY
  '1020300': 'ea',     // PvZ: Battle for Neighborville
  // Command & Conquer
  '1213210': 'ea',     // C&C Remastered
  // Burnout
  '1238820': 'ea',     // Burnout Paradise Remastered
}

// Publisher/developer name fragments → store.
// Used during metadata enrichment to dynamically re-attribute unlisted games.
export const PUBLISHER_STORE_MAP: { pattern: RegExp; store: GameStore }[] = [
  { pattern: /\belectronic\s+arts\b/i, store: 'ea' },
  { pattern: /\bea\s+games?\b/i,       store: 'ea' },
  { pattern: /\bea\s+sports?\b/i,      store: 'ea' },
  { pattern: /\bea\s+originals?\b/i,   store: 'ea' },
  { pattern: /\brespawn\b/i,           store: 'ea' },
  { pattern: /\bbioware\b/i,           store: 'ea' },
  { pattern: /\bmaxis\b/i,             store: 'ea' },
  { pattern: /\bpsyonix\b/i,           store: 'epic' },
  // "Epic Games" as a publisher (not developer) indicates Epic exclusives
]

export function inferStoreFromPublisher(publisher: string): GameStore | null {
  for (const { pattern, store } of PUBLISHER_STORE_MAP) {
    if (pattern.test(publisher)) return store
  }
  return null
}
