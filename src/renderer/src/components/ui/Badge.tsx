import type { GameStore } from '@shared/types'

const STORE_LABELS: Record<GameStore, string> = {
  steam: 'Steam',
  epic: 'Epic',
  ea: 'EA'
}

interface BadgeProps {
  store: GameStore
}

export default function Badge({ store }: BadgeProps): JSX.Element {
  return (
    <span className={`badge badge--${store}`}>
      {STORE_LABELS[store]}
    </span>
  )
}
