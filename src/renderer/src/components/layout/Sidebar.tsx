import { useGameStore } from '../../store/useGameStore'
import type { AppConfig, GameStore } from '@shared/types'

const STORE_DOT_COLORS: Record<GameStore, string> = {
  steam: '#1b9cd8',
  epic: '#a0a0a0',
  ea: '#f56f00'
}

const STORE_LABELS: Record<GameStore, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  ea: 'EA App'
}

const STORES: GameStore[] = ['steam', 'epic', 'ea']

interface Props {
  onSettingsClick: () => void
}

export default function Sidebar({ onSettingsClick }: Props): JSX.Element {
  const {
    games,
    activeFilters,
    searchQuery,
    errors,
    toggleFilter,
    clearFilters,
    setSearchQuery,
    showHidden,
    setShowHidden,
    tileSize,
    setTileSize
  } = useGameStore()

  const counts = STORES.reduce(
    (acc, s) => ({ ...acc, [s]: games.filter((g) => g.store === s).length }),
    {} as Record<GameStore, number>
  )

  const handleTileSizeChange = async (size: 'small' | 'medium' | 'large'): Promise<void> => {
    setTileSize(size)
    // Persist to config, merging with existing settings
    const cfg: AppConfig = await window.api.getConfig()
    await window.api.saveConfig({ ...cfg, tileSize: size })
  }

  return (
    <aside className="sidebar">
      <input
        type="search"
        className="sidebar__search"
        placeholder="Search games…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        spellCheck={false}
      />

      <p className="sidebar__section-label">Stores</p>

      {STORES.map((store) => (
        <button
          key={store}
          className={`filter-pill${activeFilters.includes(store) ? ' filter-pill--active' : ''}`}
          onClick={() => toggleFilter(store)}
          aria-pressed={activeFilters.includes(store)}
        >
          <span className="filter-pill__left">
            <span
              className="filter-pill__dot"
              style={{ background: STORE_DOT_COLORS[store] }}
            />
            {STORE_LABELS[store]}
          </span>
          <span className="filter-pill__count">{counts[store] ?? 0}</span>
        </button>
      ))}

      {activeFilters.length > 0 && (
        <button
          className="filter-pill"
          onClick={clearFilters}
          style={{ marginTop: 4, fontSize: 11, color: 'var(--accent)' }}
        >
          <span className="filter-pill__left">Clear filters</span>
        </button>
      )}

      <div className="sidebar__divider" />

      <p className="sidebar__total">{games.length} games total</p>

      {errors.length > 0 && (
        <>
          <div className="sidebar__divider" />
          <p className="sidebar__section-label" style={{ color: '#e07070' }}>
            Detection warnings
          </p>
          {errors.map((err, i) => (
            <p key={i} style={{ fontSize: 11, color: '#e07070', padding: '2px 10px', lineHeight: 1.4 }}>
              {err}
            </p>
          ))}
        </>
      )}

      {/* Bottom controls */}
      <div className="sidebar__bottom">
        <div className="sidebar__divider" />

        {/* Tile size */}
        <p className="sidebar__section-label">Tile size</p>
        <div className="sidebar__tile-size-group">
          {(['small', 'medium', 'large'] as const).map((s) => (
            <button
              key={s}
              className={`tile-size-btn${tileSize === s ? ' tile-size-btn--active' : ''}`}
              onClick={() => handleTileSizeChange(s)}
              title={s.charAt(0).toUpperCase() + s.slice(1)}
            >
              {s === 'small' ? 'S' : s === 'medium' ? 'M' : 'L'}
            </button>
          ))}
        </div>

        <div className="sidebar__divider" />

        {/* Show hidden games toggle */}
        <label className="sidebar__checkbox-row">
          <input
            type="checkbox"
            className="sidebar__checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          <span>Show hidden games</span>
        </label>

        {/* Settings button */}
        <button className="sidebar__settings-btn" onClick={onSettingsClick} title="Settings">
          <span>⚙</span>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}
