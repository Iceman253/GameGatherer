import { useEffect, useRef, useState } from 'react'
import { useGames } from './hooks/useGames'
import TitleBar from './components/layout/TitleBar'
import Sidebar from './components/layout/Sidebar'
import GameGrid from './components/library/GameGrid'
import GameDetailPage from './components/detail/GameDetailPage'
import SettingsModal from './components/settings/SettingsModal'
import { useGameStore } from './store/useGameStore'

function LibraryHeader(): JSX.Element {
  const { filteredGames, games, isLoading } = useGameStore()
  return (
    <div className="library-header">
      <span className="library-header__title">My Library</span>
      {!isLoading && (
        <span className="library-header__count">
          {filteredGames.length !== games.length
            ? `${filteredGames.length} of ${games.length} games`
            : `${games.length} games`}
        </span>
      )}
    </div>
  )
}

export default function App(): JSX.Element {
  useGames()
  const {
    selectedGame, selectGame,
    setHiddenGameIds, setTileSize, applyCustomCovers, setGameOrder, setCollections,
    tileSize
  } = useGameStore()
  const [showSettings, setShowSettings] = useState(false)
  const prevTileSize = useRef(tileSize)

  // Load all persisted config on startup
  useEffect(() => {
    window.api.getConfig().then((cfg) => {
      if (cfg.hiddenGameIds?.length) setHiddenGameIds(cfg.hiddenGameIds)
      if (cfg.gameOrder?.length) setGameOrder(cfg.gameOrder)
      if (cfg.customCovers && Object.keys(cfg.customCovers).length) applyCustomCovers(cfg.customCovers)
      if (cfg.collections?.length) setCollections(cfg.collections)
      const size = cfg.tileSize ?? 'medium'
      setTileSize(size)
      // Apply saved window size for the current tile size on startup
      const savedSize = cfg.windowSizes?.[size]
      if (savedSize) window.api.applyWindowSize(savedSize.width, savedSize.height)
    })
  }, [])

  // When tile size changes: save current window size for old size, restore saved size for new size
  useEffect(() => {
    const prev = prevTileSize.current
    if (prev === tileSize) return
    prevTileSize.current = tileSize

    window.api.getConfig().then((cfg) => {
      const currentSize = { width: window.innerWidth, height: window.innerHeight }
      const sizes = { ...(cfg.windowSizes ?? {}), [prev]: currentSize }
      const savedForNew = sizes[tileSize]
      window.api.saveConfig({ ...cfg, windowSizes: sizes }).then(() => {
        if (savedForNew) window.api.applyWindowSize(savedForNew.width, savedForNew.height)
      })
    })
  }, [tileSize])

  // Auto-save window size on manual resize (debounced 600ms)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const handleResize = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        window.api.getConfig().then((cfg) => {
          const size = { width: window.innerWidth, height: window.innerHeight }
          window.api.saveConfig({ ...cfg, windowSizes: { ...(cfg.windowSizes ?? {}), [tileSize]: size } })
        })
      }, 600)
    }
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); clearTimeout(timer) }
  }, [tileSize])

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="content-area">
        <Sidebar onSettingsClick={() => setShowSettings(true)} />
        <main className="library-view">
          {selectedGame ? (
            <GameDetailPage game={selectedGame} onBack={() => selectGame(null)} />
          ) : (
            <>
              <LibraryHeader />
              <GameGrid />
            </>
          )}
        </main>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
