// Browser test page standing in for the 똑딱작업실 web app: hands a 품의 to the extension.
import { EXTENSION_ID } from '../../src/ids'

Object.assign(window, {
  sendToExtension: (text: string) =>
    new Promise((resolve) => (window as any).chrome.runtime.sendMessage(EXTENSION_ID, { type: 'pumui:send', text }, resolve)),
})

