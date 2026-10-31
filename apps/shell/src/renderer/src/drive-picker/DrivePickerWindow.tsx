import { useCallback, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type { DriveEntry, DriveListingRequest } from '../../../shared/drive-api'
import type { DrivePickerApi } from '../../../shared/drive-picker-api'
import { DRIVE_ERROR_KEYS, DriveBrowser } from '../DriveBrowser'
import { driveUiText, type DriveStringKey } from '../i18n/strings-drive'

/** Tick Drive files and folders, then attach them to the AI panel that asked */
export function DrivePickerWindow({ lang, api }: { lang: Lang; api: DrivePickerApi }) {
  const t = (key: DriveStringKey, params?: Record<string, string>) => driveUiText(lang, key, params)
  const [selected, setSelected] = useState<Map<string, DriveEntry>>(new Map())
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<DriveStringKey | null>(null)

  const list = useCallback(
    (listing: DriveListingRequest, pageToken?: string) => api.list(listing, pageToken),
    [api],
  )

  const toggle = (entry: DriveEntry) =>
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(entry.id)) next.delete(entry.id)
      else next.set(entry.id, entry)
      return next
    })

  const attach = async () => {
    setWorking(true)
    setError(null)
    const picks = [...selected.values()].map((e) => ({ id: e.id, folder: e.type === 'folder' }))
    const result = await api.choose(picks).catch(() => null)
    // on success main closes this window
    if (!result || !result.ok) {
      setWorking(false)
      setError(DRIVE_ERROR_KEYS[result?.kind ?? 'network'])
    }
  }

  return (
    <div className="dp">
      <div className="dp-body">
        <DriveBrowser
          lang={lang}
          dateLocale={document.documentElement.lang}
          list={list}
          pick={{ selected, toggle }}
          disabled={working}
        />
      </div>
      <div className="dp-foot">
        <span className="dp-count">
          {working
            ? t('drivePickWorking')
            : error
              ? t(error)
              : t('drivePickSelected', { n: String(selected.size) })}
        </span>
        <button className="drive-ghost" onClick={() => void api.cancel()} disabled={working}>
          {t('driveCancel')}
        </button>
        <button
          className="drive-primary"
          onClick={() => void attach()}
          disabled={working || selected.size === 0}
        >
          {t('drivePickAttach')}
        </button>
      </div>
    </div>
  )
}
