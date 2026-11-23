import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CHANNELS, type AiState, type NeisProgress, type SaenggibuApi } from '../shared/api'

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
  sendToNeis: (text, requestId) => ipcRenderer.invoke(CHANNELS.sendToNeis, text, requestId),
  focusNeisSend: (requestId) => ipcRenderer.invoke(CHANNELS.focusNeisSend, requestId),
  cancelNeisSend: (requestId) => ipcRenderer.invoke(CHANNELS.cancelNeisSend, requestId),
  onNeisProgress(handler) {
    const listener = (_event: IpcRendererEvent, progress: NeisProgress) => handler(progress)
    ipcRenderer.on(CHANNELS.neisProgress, listener)
    return () => ipcRenderer.removeListener(CHANNELS.neisProgress, listener)
  },
  readNeisClass: () => ipcRenderer.invoke(CHANNELS.readNeisClass),
  version: () => ipcRenderer.invoke(CHANNELS.version),
  setUnsaved: (unsaved) => ipcRenderer.send(CHANNELS.unsaved, unsaved === true),
  onSaveBeforeClose(handler) {
    const listener = () => handler()
    ipcRenderer.on(CHANNELS.saveBeforeClose, listener)
    return () => ipcRenderer.removeListener(CHANNELS.saveBeforeClose, listener)
  },
  closeNow: () => ipcRenderer.invoke(CHANNELS.closeNow),
}

contextBridge.exposeInMainWorld('saenggibu', api)
