import React from 'react'
import { createRoot } from 'react-dom/client'
import { htmlDir, htmlLang } from '@genoffice/i18n'
import '@genoffice/ui/tokens.css'
import './drive-picker.css'
import { DrivePickerWindow } from './DrivePickerWindow'
import type { DrivePickerApi, DrivePickerTheme } from '../../../shared/drive-picker-api'

declare global {
  interface Window {
    /** the picker window's own preload (src/preload/drive-picker.ts) */
    aiOfficeDrivePicker: DrivePickerApi
  }
}

function applyTheme(theme: DrivePickerTheme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

const api = window.aiOfficeDrivePicker
// language and theme land before first paint so the window never flashes the other one
void api.getInit().then(({ lang, theme }) => {
  applyTheme(theme)
  api.onThemeChanged(applyTheme)
  document.documentElement.lang = htmlLang(lang)
  document.documentElement.dir = htmlDir(lang)
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <DrivePickerWindow lang={lang} api={api} />
    </React.StrictMode>,
  )
})
