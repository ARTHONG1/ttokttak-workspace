import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CHANNELS, type AiState, type SaenggibuApi } from '../shared/api'

const api: SaenggibuApi = {
  ask: (request) => ipcRenderer.invoke(CHANNELS.ask, request),
  cancel: (requestId) => ipcRenderer.invoke(CHANNELS.cancel, requestId),
  aiState: () => ipcRenderer.invoke(CHANNELS.aiState),
  onAiState(handler) {
    const listener = (_event: IpcRendererEvent, state: AiState) => handler(state)
    ipcRenderer.on(CHANNELS.aiStateChanged, listener)
    return () => ipcRenderer.removeListener(CHANNELS.aiStateChanged, listener)
  },
  modelInfo: () => ipcRenderer.invoke(CHANNELS.modelInfo),
  retryModel: () => ipcRenderer.invoke(CHANNELS.retryModel),
  importModel: () => ipcRenderer.invoke(CHANNELS.importModel),
  openModelPage: () => ipcRenderer.invoke(CHANNELS.openModelPage),
  readTableFile: () => ipcRenderer.invoke(CHANNELS.readTableFile),
  sendToNeis: (text) => ipcRenderer.invoke(CHANNELS.sendToNeis, text),
  version: () => ipcRenderer.invoke(CHANNELS.version),
}

contextBridge.exposeInMainWorld('saenggibu', api)
