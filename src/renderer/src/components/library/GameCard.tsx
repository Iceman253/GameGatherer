import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Tilt from 'react-vanilla-tilt'
import type { Game } from '@shared/types'
import { useGameStore } from '../../store/useGameStore'
import CoverArt from './CoverArt'
import Badge from '../ui/Badge'

const TILT_OPTIONS = {
  max: 14,
  perspective: 800,
  scale: 1.05,
  speed: 300,
  glare: true,
  'max-glare': 0.22,
  easing: 'cubic-bezier(.03,.98,.52,.99)'
}

const MENU_W = 160
const MENU_H = 300

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h.toLocaleString()}h ${m}m` : `${h.toLocaleString()}h`
}

function formatLastPlayed(ts: number): string {
  const now = Date.now() / 1000
  const diff = now - ts
  if (diff < 86400) return 'Today'
  if (diff < 172800) return 'Yesterday'
  const days = Math.floor(diff / 86400)
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

interface GameCardProps {
  game: Game
  onSelect: (game: Game) => void
  isDragging?: boolean
  isDragTarget?: boolean
  dragSide?: 'before' | 'after' | null
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: () => void
  onDrop?: (e: React.DragEvent) => void
}

export default function GameCard({
  game, onSelect,
  isDragging, isDragTarget, dragSide,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop
}: GameCardProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [colSpan, setColSpan] = useState(1)
  const [cardRatio, setCardRatio] = useState<string | undefined>(undefined)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { hideGame, hiddenGameIds, unhideGame, setCustomCover, removeCustomCover, customCovers } = useGameStore()

  const isHidden = hiddenGameIds.includes(game.id)
  const hasCustomCover = Boolean(customCovers[game.id])

  useEffect(() => {
    setColSpan(1)
    setCardRatio(undefined)
  }, [game.coverArtUrl])

  // Clean up close timer on unmount
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  const scheduleClose = (): void => {
    closeTimer.current = setTimeout(() => setMenuOpen(false), 120)
  }
  const cancelClose = (): void => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  const handleImageLoad = (w: number, h: number): void => {
    const STANDARD_RATIO = 2 / 3
    const imgRatio = w / h
    if (imgRatio <= STANDARD_RATIO * 1.05) return
    const span = Math.min(4, Math.max(1, Math.round(imgRatio / STANDARD_RATIO)))
    if (span > 1) {
      setColSpan(span)
      setCardRatio(`${w} / ${h}`)
    }
  }

  const handleSetThumbnail = async (): Promise<void> => {
    setMenuOpen(false)
    const fileUrl = await window.api.pickThumbnail()
    if (fileUrl) await setCustomCover(game.id, fileUrl)
  }

  const handleResetThumbnail = async (): Promise<void> => {
    setMenuOpen(false)
    await removeCustomCover(game.id)
  }

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    cancelClose()
    // Position at cursor, nudging inward if near viewport edge
    const x = e.clientX + MENU_W > window.innerWidth ? e.clientX - MENU_W : e.clientX + 2
    const y = e.clientY + MENU_H > window.innerHeight ? e.clientY - MENU_H : e.clientY + 2
    setMenuPos({ x, y })
    setMenuOpen(true)
  }

  const hasPlaytime = game.playtimeMinutes != null && game.playtimeMinutes > 0
  const hasLastPlayed = game.lastPlayed != null

  const wrapperClasses = [
    'card-wrapper',
    isDragging ? 'card-wrapper--dragging' : '',
    isDragTarget && dragSide ? `card-wrapper--drop-${dragSide}` : ''
  ].filter(Boolean).join(' ')

  return (
    <div
      className={wrapperClasses}
      style={colSpan > 1 ? { gridColumn: `span ${colSpan}` } : undefined}
      onContextMenu={handleContextMenu}
      onMouseLeave={scheduleClose}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Tilt options={TILT_OPTIONS} className="game-card-tilt" style={{ background: 'transparent', boxShadow: 'none' }}>
        <div
          className="game-card"
          style={cardRatio ? { aspectRatio: cardRatio } : undefined}
          onClick={() => onSelect(game)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(game) }}
          role="button"
          tabIndex={0}
          aria-label={`Open ${game.name}`}
        >
          <CoverArt
            src={game.coverArtUrl}
            alt={game.name}
            className={`game-card__art${colSpan > 1 ? ' game-card__art--wide' : ''}`}
            onNaturalSize={handleImageLoad}
          />
          <div className="game-card__overlay">
            <Badge store={game.store} />
            <h3 className="game-card__title">{game.name}</h3>
          </div>
        </div>
      </Tilt>

      {/* Context menu rendered via portal at fixed cursor position */}
      {menuOpen && createPortal(
        <div
          className="card-context-menu"
          style={{ left: menuPos.x, top: menuPos.y }}
          onMouseEnter={cancelClose}
          onMouseLeave={() => setMenuOpen(false)}
        >
          <p className="card-context-menu__title">{game.name}</p>

          {(hasLastPlayed || hasPlaytime) && (
            <div className="card-context-menu__stats">
              {hasLastPlayed && (
                <span className="card-context-menu__stat">
                  <span className="card-context-menu__stat-label">Last played</span>
                  <span className="card-context-menu__stat-value">{formatLastPlayed(game.lastPlayed!)}</span>
                </span>
              )}
              {hasPlaytime && (
                <span className="card-context-menu__stat">
                  <span className="card-context-menu__stat-label">Playtime</span>
                  <span className="card-context-menu__stat-value">{formatPlaytime(game.playtimeMinutes!)}</span>
                </span>
              )}
            </div>
          )}

          <div className="card-context-menu__divider" />

          <button
            className="card-context-menu__item card-context-menu__item--play"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); window.api.launchGame(game) }}
          >
            ▶ Play
          </button>
          <button
            className="card-context-menu__item"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onSelect(game) }}
          >
            Details
          </button>

          <div className="card-context-menu__divider" />

          <button
            className="card-context-menu__item"
            onClick={(e) => { e.stopPropagation(); handleSetThumbnail() }}
          >
            🖼 Set thumbnail…
          </button>
          {hasCustomCover && (
            <button
              className="card-context-menu__item card-context-menu__item--danger"
              onClick={(e) => { e.stopPropagation(); handleResetThumbnail() }}
            >
              Reset thumbnail
            </button>
          )}

          <div className="card-context-menu__divider" />

          {isHidden ? (
            <button
              className="card-context-menu__item"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); unhideGame(game.id) }}
            >
              Unhide game
            </button>
          ) : (
            <button
              className="card-context-menu__item card-context-menu__item--danger"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); hideGame(game.id) }}
            >
              Hide game
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
