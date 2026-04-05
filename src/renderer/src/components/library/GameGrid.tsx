import { useState } from 'react'
import { useGameStore } from '../../store/useGameStore'
import type { Game } from '@shared/types'
import GameCard from './GameCard'
import GameCardSkeleton from './GameCardSkeleton'

const SKELETON_COUNT = 20

function computeNewOrder(
  allIds: string[],
  draggingId: string,
  dragOverId: string,
  dragSide: 'before' | 'after'
): string[] {
  const ids = allIds.filter((id) => id !== draggingId)
  const targetIdx = ids.indexOf(dragOverId)
  if (targetIdx === -1) return [...ids, draggingId]
  const insertAt = dragSide === 'after' ? targetIdx + 1 : targetIdx
  ids.splice(insertAt, 0, draggingId)
  return ids
}

export default function GameGrid(): JSX.Element {
  const { filteredGames, games, isLoading, selectGame, gameOrder, setGameOrder } = useGameStore()

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragSide, setDragSide] = useState<'before' | 'after'>('after')

  const handleSelect = (game: Game): void => selectGame(game)

  const handleDragStart = (id: string): void => setDraggingId(id)

  const handleDragEnd = (): void => {
    setDraggingId(null)
    setDragOverId(null)
  }

  const handleDragOver = (e: React.DragEvent, id: string): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDragOverId(id)
    setDragSide(e.clientX < rect.left + rect.width / 2 ? 'before' : 'after')
  }

  const handleDragLeave = (id: string): void => {
    if (dragOverId === id) setDragOverId(null)
  }

  const handleDrop = (e: React.DragEvent, dropTargetId: string): void => {
    e.preventDefault()
    if (!draggingId || draggingId === dropTargetId) {
      setDraggingId(null)
      setDragOverId(null)
      return
    }
    // Build base order from full game list (preserves order of non-visible games)
    const baseOrder = gameOrder.length > 0
      ? gameOrder
      : games.map((g) => g.id)
    // Ensure all current games are represented even if not in stored order
    const allIds = [...new Set([...baseOrder, ...games.map((g) => g.id)])]
    const newOrder = computeNewOrder(allIds, draggingId, dropTargetId, dragSide)
    setGameOrder(newOrder)
    setDraggingId(null)
    setDragOverId(null)
  }

  if (isLoading) {
    return (
      <div className="library-scroll-area">
        <div className="game-grid">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <GameCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (filteredGames.length === 0) {
    return (
      <div className="library-scroll-area">
        <div className="game-grid">
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            <span style={{ fontSize: 40 }}>🎮</span>
            <p>No games found</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="library-scroll-area">
      <div className="game-grid">
        {filteredGames.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            onSelect={handleSelect}
            isDragging={draggingId === game.id}
            isDragTarget={dragOverId === game.id && draggingId !== game.id}
            dragSide={dragOverId === game.id ? dragSide : null}
            onDragStart={() => handleDragStart(game.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, game.id)}
            onDragLeave={() => handleDragLeave(game.id)}
            onDrop={(e) => handleDrop(e, game.id)}
          />
        ))}
      </div>
    </div>
  )
}
