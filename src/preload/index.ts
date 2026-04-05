import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../main/ipc/channels'
import type { ElectronAPI, Game, GameStore } from '../shared/types'

const api: ElectronAPI = {
  getGames: () => ipcRenderer.invoke(IPC_CHANNELS.GET_GAMES),

  refreshGames: () => ipcRenderer.invoke(IPC_CHANNELS.REFRESH_GAMES),

  launchGame: (game: Game) => ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_GAME, game),

  openStorePage: (game: Game) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_STORE_PAGE, game),

  getMetadata: (game: Game, forceRefresh?: boolean) => ipcRenderer.invoke(IPC_CHANNELS.GET_METADATA, game, forceRefresh),

  updateGameCover: (_id: string, _url: string) => { /* pushed from main */ },

  onCoverUpdate: (callback: (id: string, url: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, id: string, url: string) => callback(id, url)
    ipcRenderer.on(IPC_CHANNELS.COVER_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.COVER_UPDATE, handler)
  },

  onStoreReclassify: (callback: (id: string, store: GameStore) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, id: string, store: GameStore) => callback(id, store)
    ipcRenderer.on(IPC_CHANNELS.STORE_RECLASSIFY, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STORE_RECLASSIFY, handler)
  },

  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG),
  saveConfig: (config) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_CONFIG, config),
  testIgdb: (clientId, clientSecret) => ipcRenderer.invoke(IPC_CHANNELS.TEST_IGDB, clientId, clientSecret),
  testSteam: (apiKey, steamId) => ipcRenderer.invoke(IPC_CHANNELS.TEST_STEAM, apiKey, steamId),
  hideGame: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.HIDE_GAME, id),
  unhideGame: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.UNHIDE_GAME, id),
  pickThumbnail: () => ipcRenderer.invoke(IPC_CHANNELS.PICK_THUMBNAIL),
  applyWindowSize: (width: number, height: number) => ipcRenderer.send(IPC_CHANNELS.WINDOW_APPLY_SIZE, width, height),

  windowMinimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
  windowMaximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
  windowClose: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
  fetchStoreDescription: (url: string, gameId: string) => ipcRenderer.invoke(IPC_CHANNELS.FETCH_STORE_DESC, url, gameId)
}

contextBridge.exposeInMainWorld('api', api)
