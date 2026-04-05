import { shell } from 'electron'
import { spawn } from 'child_process'
import type { Game } from '../shared/types'

export function launchGame(game: Game): { success: boolean; error?: string } {
  try {
    if (game.store === 'steam' && game.appId) {
      shell.openExternal(`steam://rungameid/${game.appId}`)
      return { success: true }
    }

    if (game.store === 'epic' && game.appId) {
      shell.openExternal(
        `com.epicgames.launcher://apps/${game.appId}?action=launch&silent=true`
      )
      return { success: true }
    }

    if (game.store === 'ea' && game.appId) {
      shell.openExternal(`origin2://game/launch?offerIds=${game.appId}`)
      return { success: true }
    }

    // Fallback: direct executable launch
    if (game.executablePath) {
      const child = spawn(game.executablePath, [], {
        detached: true,
        stdio: 'ignore',
        cwd: game.installPath
      })
      child.unref()
      return { success: true }
    }

    return { success: false, error: 'No launch method available for this game' }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export function openStorePage(game: Game): void {
  if (game.store === 'steam' && game.appId) {
    shell.openExternal(`https://store.steampowered.com/app/${game.appId}`)
  } else if (game.store === 'epic') {
    shell.openExternal('https://store.epicgames.com/en-US/library')
  } else if (game.store === 'ea') {
    shell.openExternal('https://www.ea.com/ea-app')
  }
}
