// Browser test page standing in for the 똑딱작업실 web app: hands work to the extension.
import { EXTENSION_ID } from '../../src/core/ids'

const ask = (message: unknown) =>
  new Promise((resolve) =>
    (window as any).chrome.runtime.sendMessage(EXTENSION_ID, message, resolve),
  )

Object.assign(window, {
  /** what web apps before task names send */
  sendToExtension: (text: string) => ask({ type: 'pumui:send', text }),
  sendWork: (feature: string, text: string) => ask({ type: 'work:send', feature, text }),
})
