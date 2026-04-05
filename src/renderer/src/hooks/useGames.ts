import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'

export function useGames(): void {
  const { setGames, setLoading, updateGameCover, reclassifyGame } = useGameStore()

  useEffect(() => {
    setLoading(true)

    window.api.getGames()
      .then(({ games, errors }) => {
        setGames(games, errors)
        setLoading(false)
      })
      .catch((err: Error) => {
        setGames([], [err.message])
        setLoading(false)
      })

    const unsubCover = window.api.onCoverUpdate((id, url) => updateGameCover(id, url))
    const unsubReclassify = window.api.onStoreReclassify((id, store) => reclassifyGame(id, store))

    return () => {
      unsubCover()
      unsubReclassify()
    }
  }, [])
}
