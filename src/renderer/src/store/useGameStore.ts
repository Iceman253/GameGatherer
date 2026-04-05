import { create } from 'zustand'
import type { Game, GameStore, GameMetadata, Collection } from '@shared/types'

type TileSize = 'small' | 'medium' | 'large'

const TILE_WIDTHS: Record<TileSize, string> = {
  small: '160px',
  medium: '240px',
  large: '300px'
}

interface GameState {
  games: Game[]
  filteredGames: Game[]
  activeFilters: GameStore[]
  searchQuery: string
  isLoading: boolean
  errors: string[]
  selectedGame: Game | null
  metadataCache: Map<string, GameMetadata>
  hiddenGameIds: string[]
  showHidden: boolean
  tileSize: TileSize
  customCovers: Record<string, string>
  gameOrder: string[]
  collections: Collection[]
  expandedCollectionId: string | null
  // actions
  setGames: (games: Game[], errors: string[]) => void
  toggleFilter: (store: GameStore) => void
  clearFilters: () => void
  setSearchQuery: (q: string) => void
  setLoading: (v: boolean) => void
  updateGameCover: (id: string, url: string) => void
  reclassifyGame: (id: string, store: GameStore) => void
  selectGame: (game: Game | null) => void
  cacheMetadata: (gameId: string, meta: GameMetadata) => void
  setHiddenGameIds: (ids: string[]) => void
  hideGame: (id: string) => Promise<void>
  unhideGame: (id: string) => Promise<void>
  setShowHidden: (v: boolean) => void
  setTileSize: (size: TileSize) => void
  setCustomCover: (id: string, fileUrl: string) => Promise<void>
  applyCustomCovers: (covers: Record<string, string>) => void
  removeCustomCover: (id: string) => Promise<void>
  setGameOrder: (ids: string[]) => void
  setCollections: (cols: Collection[]) => void
  setExpandedCollectionId: (id: string | null) => void
  createCollection: (draggingId: string, targetId: string) => void
  addToCollection: (collectionId: string, gameId: string) => void
  removeFromCollection: (collectionId: string, gameId: string) => void
  deleteCollection: (collectionId: string) => void
  renameCollection: (id: string, name: string) => void
  reorderInCollection: (collectionId: string, draggingId: string, dropTargetId: string, side: 'before' | 'after') => void
}

function applyFilters(
  games: Game[],
  activeFilters: GameStore[],
  searchQuery: string,
  hiddenGameIds: string[],
  showHidden: boolean,
  gameOrder: string[]
): Game[] {
  let result = games
  if (!showHidden) {
    result = result.filter((g) => !hiddenGameIds.includes(g.id))
  }
  if (activeFilters.length > 0) {
    result = result.filter((g) => activeFilters.includes(g.store))
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    result = result.filter((g) => g.name.toLowerCase().includes(q))
  }
  if (gameOrder.length > 0) {
    const orderMap = new Map(gameOrder.map((id, i) => [id, i]))
    result = [...result].sort((a, b) => {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : Infinity
      const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : Infinity
      return ai - bi
    })
  }
  return result
}

function applyTileWidth(size: TileSize): void {
  document.documentElement.style.setProperty('--card-w', TILE_WIDTHS[size])
}

function persistCollectionsAndOrder(cols: Collection[], order: string[]): void {
  window.api.getConfig().then((cfg) =>
    window.api.saveConfig({ ...cfg, collections: cols, gameOrder: order })
  )
}

function persistCollections(cols: Collection[]): void {
  window.api.getConfig().then((cfg) =>
    window.api.saveConfig({ ...cfg, collections: cols })
  )
}

export const useGameStore = create<GameState>((set, get) => ({
  games: [],
  filteredGames: [],
  activeFilters: [],
  searchQuery: '',
  isLoading: false,
  errors: [],
  selectedGame: null,
  metadataCache: new Map(),
  hiddenGameIds: [],
  showHidden: false,
  tileSize: 'medium',
  customCovers: {},
  gameOrder: [],
  collections: [],
  expandedCollectionId: null,

  setGames: (games, errors) => {
    const { activeFilters, searchQuery, hiddenGameIds, showHidden, customCovers, gameOrder } = get()
    const withCovers = Object.keys(customCovers).length
      ? games.map((g) => customCovers[g.id] ? { ...g, coverArtUrl: customCovers[g.id] } : g)
      : games
    set({ games: withCovers, errors, filteredGames: applyFilters(withCovers, activeFilters, searchQuery, hiddenGameIds, showHidden, gameOrder) })
  },

  toggleFilter: (store) => {
    const { activeFilters, games, searchQuery, hiddenGameIds, showHidden, gameOrder } = get()
    const next = activeFilters.includes(store)
      ? activeFilters.filter((f) => f !== store)
      : [...activeFilters, store]
    set({ activeFilters: next, filteredGames: applyFilters(games, next, searchQuery, hiddenGameIds, showHidden, gameOrder) })
  },

  clearFilters: () => {
    const { games, hiddenGameIds, showHidden, gameOrder } = get()
    set({ activeFilters: [], searchQuery: '', filteredGames: applyFilters(games, [], '', hiddenGameIds, showHidden, gameOrder) })
  },

  setSearchQuery: (q) => {
    const { games, activeFilters, hiddenGameIds, showHidden, gameOrder } = get()
    set({ searchQuery: q, filteredGames: applyFilters(games, activeFilters, q, hiddenGameIds, showHidden, gameOrder) })
  },

  setLoading: (v) => set({ isLoading: v }),

  updateGameCover: (id, url) => {
    const { games, activeFilters, searchQuery, hiddenGameIds, showHidden, gameOrder } = get()
    const updated = games.map((g) => (g.id === id ? { ...g, coverArtUrl: url } : g))
    set({ games: updated, filteredGames: applyFilters(updated, activeFilters, searchQuery, hiddenGameIds, showHidden, gameOrder) })
    const { selectedGame } = get()
    if (selectedGame?.id === id) set({ selectedGame: { ...selectedGame, coverArtUrl: url } })
  },

  reclassifyGame: (id, store) => {
    const { games, activeFilters, searchQuery, selectedGame, hiddenGameIds, showHidden, gameOrder } = get()
    const updated = games.map((g) => (g.id === id ? { ...g, store } : g))
    set({ games: updated, filteredGames: applyFilters(updated, activeFilters, searchQuery, hiddenGameIds, showHidden, gameOrder) })
    if (selectedGame?.id === id) set({ selectedGame: { ...selectedGame, store } })
  },

  selectGame: (game) => set({ selectedGame: game }),

  cacheMetadata: (gameId, meta) => {
    const { metadataCache } = get()
    const next = new Map(metadataCache)
    next.set(gameId, meta)
    set({ metadataCache: next })
  },

  setHiddenGameIds: (ids) => {
    const { games, activeFilters, searchQuery, showHidden, gameOrder } = get()
    set({ hiddenGameIds: ids, filteredGames: applyFilters(games, activeFilters, searchQuery, ids, showHidden, gameOrder) })
  },

  hideGame: async (id) => {
    await window.api.hideGame(id)
    const { hiddenGameIds, games, activeFilters, searchQuery, showHidden, gameOrder } = get()
    const next = [...hiddenGameIds, id]
    set({ hiddenGameIds: next, filteredGames: applyFilters(games, activeFilters, searchQuery, next, showHidden, gameOrder) })
  },

  unhideGame: async (id) => {
    await window.api.unhideGame(id)
    const { hiddenGameIds, games, activeFilters, searchQuery, showHidden, gameOrder } = get()
    const next = hiddenGameIds.filter((h) => h !== id)
    set({ hiddenGameIds: next, filteredGames: applyFilters(games, activeFilters, searchQuery, next, showHidden, gameOrder) })
  },

  setShowHidden: (v) => {
    const { games, activeFilters, searchQuery, hiddenGameIds, gameOrder } = get()
    set({ showHidden: v, filteredGames: applyFilters(games, activeFilters, searchQuery, hiddenGameIds, v, gameOrder) })
  },

  setTileSize: (size) => {
    applyTileWidth(size)
    set({ tileSize: size })
  },

  setCustomCover: async (id, fileUrl) => {
    const { games, activeFilters, searchQuery, hiddenGameIds, showHidden, selectedGame, customCovers, gameOrder } = get()
    const nextCovers = { ...customCovers, [id]: fileUrl }
    const updated = games.map((g) => (g.id === id ? { ...g, coverArtUrl: fileUrl } : g))
    set({
      customCovers: nextCovers,
      games: updated,
      filteredGames: applyFilters(updated, activeFilters, searchQuery, hiddenGameIds, showHidden, gameOrder)
    })
    if (selectedGame?.id === id) set({ selectedGame: { ...selectedGame, coverArtUrl: fileUrl } })
    const cfg = await window.api.getConfig()
    await window.api.saveConfig({ ...cfg, customCovers: nextCovers })
  },

  applyCustomCovers: (covers) => {
    const { games, activeFilters, searchQuery, hiddenGameIds, showHidden, gameOrder } = get()
    if (!Object.keys(covers).length) return
    const updated = games.map((g) => covers[g.id] ? { ...g, coverArtUrl: covers[g.id] } : g)
    set({
      customCovers: covers,
      games: updated,
      filteredGames: applyFilters(updated, activeFilters, searchQuery, hiddenGameIds, showHidden, gameOrder)
    })
  },

  removeCustomCover: async (id) => {
    const { customCovers } = get()
    const nextCovers = { ...customCovers }
    delete nextCovers[id]
    const cfg = await window.api.getConfig()
    await window.api.saveConfig({ ...cfg, customCovers: nextCovers })
    const result = await window.api.refreshGames()
    const { activeFilters, searchQuery, hiddenGameIds, showHidden, gameOrder } = get()
    const withCovers = Object.keys(nextCovers).length
      ? result.games.map((g) => nextCovers[g.id] ? { ...g, coverArtUrl: nextCovers[g.id] } : g)
      : result.games
    set({
      customCovers: nextCovers,
      games: withCovers,
      errors: result.errors,
      filteredGames: applyFilters(withCovers, activeFilters, searchQuery, hiddenGameIds, showHidden, gameOrder)
    })
    const { selectedGame } = get()
    if (selectedGame?.id === id) {
      const refreshed = withCovers.find((g) => g.id === id)
      if (refreshed) set({ selectedGame: refreshed })
    }
  },

  setGameOrder: (ids) => {
    const { games, activeFilters, searchQuery, hiddenGameIds, showHidden } = get()
    set({ gameOrder: ids, filteredGames: applyFilters(games, activeFilters, searchQuery, hiddenGameIds, showHidden, ids) })
    window.api.getConfig().then((cfg) => window.api.saveConfig({ ...cfg, gameOrder: ids }))
  },

  setCollections: (cols) => set({ collections: cols }),

  setExpandedCollectionId: (id) => set({ expandedCollectionId: id }),

  createCollection: (draggingId, targetId) => {
    const { gameOrder, games, collections } = get()
    const collId = `col_${Date.now()}`
    const newCollection: Collection = { id: collId, name: 'New Collection', gameIds: [targetId, draggingId] }
    const baseOrder = gameOrder.length > 0 ? gameOrder : games.map((g) => g.id)
    const allIds = [...new Set([...baseOrder, ...games.map((g) => g.id)])]
    const targetIdx = allIds.indexOf(targetId)
    const insertAt = allIds.slice(0, targetIdx).filter((id) => id !== draggingId).length
    const filtered = allIds.filter((id) => id !== draggingId && id !== targetId)
    const newOrder = [...filtered.slice(0, insertAt), collId, ...filtered.slice(insertAt)]
    const newCollections = [...collections, newCollection]
    set({ collections: newCollections, gameOrder: newOrder })
    persistCollectionsAndOrder(newCollections, newOrder)
  },

  addToCollection: (collectionId, gameId) => {
    const { collections, gameOrder, games } = get()
    const newCollections = collections.map((c) =>
      c.id === collectionId ? { ...c, gameIds: [...c.gameIds, gameId] } : c
    )
    const baseOrder = gameOrder.length > 0 ? gameOrder : games.map((g) => g.id)
    const allIds = [...new Set([...baseOrder, ...games.map((g) => g.id)])]
    const newOrder = allIds.filter((id) => id !== gameId)
    set({ collections: newCollections, gameOrder: newOrder })
    persistCollectionsAndOrder(newCollections, newOrder)
  },

  removeFromCollection: (collectionId, gameId) => {
    const { collections, gameOrder, games, expandedCollectionId } = get()
    const coll = collections.find((c) => c.id === collectionId)
    if (!coll) return
    const newGameIds = coll.gameIds.filter((id) => id !== gameId)
    const baseOrder = gameOrder.length > 0 ? gameOrder : games.map((g) => g.id)
    const allIds = [...new Set([...baseOrder, ...games.map((g) => g.id), collectionId])]
    const collIdx = allIds.indexOf(collectionId)
    let newOrder: string[]
    let newCollections: Collection[]

    if (newGameIds.length < 2) {
      // Disband: restore all remaining games + removed game at collection's position
      const withoutColl = allIds.filter((id) => id !== collectionId && id !== gameId)
      const insertAt = Math.min(collIdx, withoutColl.length)
      const toRestore = [gameId, ...newGameIds]
      newOrder = [...withoutColl.slice(0, insertAt), ...toRestore, ...withoutColl.slice(insertAt)]
      newCollections = collections.filter((c) => c.id !== collectionId)
    } else {
      const withoutGame = allIds.filter((id) => id !== gameId)
      const colNewIdx = withoutGame.indexOf(collectionId)
      const insertAt = Math.min(colNewIdx + 1, withoutGame.length)
      newOrder = [...withoutGame.slice(0, insertAt), gameId, ...withoutGame.slice(insertAt)]
      newCollections = collections.map((c) =>
        c.id === collectionId ? { ...c, gameIds: newGameIds } : c
      )
    }

    const updates: Partial<GameState> = { collections: newCollections, gameOrder: newOrder }
    if (expandedCollectionId === collectionId && newGameIds.length < 2) {
      updates.expandedCollectionId = null
    }
    set(updates)
    persistCollectionsAndOrder(newCollections, newOrder)
  },

  deleteCollection: (collectionId) => {
    const { collections, gameOrder, games, expandedCollectionId } = get()
    const coll = collections.find((c) => c.id === collectionId)
    if (!coll) return
    const baseOrder = gameOrder.length > 0 ? gameOrder : games.map((g) => g.id)
    const allIds = [...new Set([...baseOrder, ...games.map((g) => g.id), collectionId])]
    const collIdx = allIds.indexOf(collectionId)
    const without = allIds.filter((id) => id !== collectionId)
    const insertAt = Math.min(collIdx, without.length)
    const newOrder = [...without.slice(0, insertAt), ...coll.gameIds, ...without.slice(insertAt)]
    const newCollections = collections.filter((c) => c.id !== collectionId)
    const updates: Partial<GameState> = { collections: newCollections, gameOrder: newOrder }
    if (expandedCollectionId === collectionId) updates.expandedCollectionId = null
    set(updates)
    persistCollectionsAndOrder(newCollections, newOrder)
  },

  renameCollection: (id, name) => {
    const { collections } = get()
    const newCollections = collections.map((c) => (c.id === id ? { ...c, name } : c))
    set({ collections: newCollections })
    persistCollections(newCollections)
  },

  reorderInCollection: (collectionId, draggingId, dropTargetId, side) => {
    const { collections } = get()
    const coll = collections.find((c) => c.id === collectionId)
    if (!coll) return
    const ids = coll.gameIds.filter((id) => id !== draggingId)
    const targetIdx = ids.indexOf(dropTargetId)
    if (targetIdx === -1) return
    ids.splice(side === 'after' ? targetIdx + 1 : targetIdx, 0, draggingId)
    const newCollections = collections.map((c) =>
      c.id === collectionId ? { ...c, gameIds: ids } : c
    )
    set({ collections: newCollections })
    persistCollections(newCollections)
  }
}))
