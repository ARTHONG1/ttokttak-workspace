/**
 * The strip above the pages while the side-by-side translation view is on:
 * the language picker, the translation text size, what the view is waiting
 * for, the unsaved-page-edit notice, and the one-time "fold the column?"
 * prompt. Nothing here sends anything.
 */
import type { ReactElement, ReactNode } from 'react'
import type { Lang } from '@genoffice/i18n'
import { TRANSLATION_LANGUAGES } from '../../../../../packages/pdf-structure/src/translate/language'
import type { TFunc } from '../i18n/locale'
import { languageName } from '../translate/translate-model'
import { BILINGUAL_FONT_MAX, BILINGUAL_FONT_MIN } from '../view-config'
import type { BilingualLoad } from './useBilingualData'

export interface BilingualBarProps {
  load: BilingualLoad
  lang: string | null
  /** languages with a stored translation, most recent first */
  storedLangs: readonly string[]
  uiLang: Lang
  fontSize: number
  unsavedPageEdits: boolean
  askCollapse: boolean
  t: TFunc
  onLang: (lang: string) => void
  onFontSize: (px: number) => void
  onCollapse: () => void
  onDismissCollapse: () => void
  onClose: () => void
  /** the view's actions in the bar ("translate all pages") */
  actions?: ReactNode
}

export function BilingualBar(props: BilingualBarProps): ReactElement {
  const { load, lang, storedLangs, uiLang, fontSize, t } = props
  const stored = storedLangs.filter((l) => (TRANSLATION_LANGUAGES as readonly string[]).includes(l))
  const others = TRANSLATION_LANGUAGES.filter((l) => !stored.includes(l))
  const option = (code: string) => (
    <option key={code} value={code}>
      {languageName(code, uiLang)}
    </option>
  )
  return (
    <div className="bl-bar" role="region" aria-label={t('blToggle')}>
      <span className="bl-bar-title">{t('blToggle')}</span>
      {load.kind === 'ready' && lang !== null && (
        <label className="bl-bar-lang">
          <span>{t('blLanguage')}</span>
          <select value={lang} onChange={(e) => props.onLang(e.target.value)}>
            {stored.length > 0 ? (
              <>
                <optgroup label={t('blStoredLangs')}>{stored.map(option)}</optgroup>
                <optgroup label={t('blOtherLangs')}>{others.map(option)}</optgroup>
              </>
            ) : (
              others.map(option)
            )}
          </select>
        </label>
      )}
      <span className="bl-bar-font">
        <button
          type="button"
          className="bl-bar-btn"
          aria-label={t('blFontSmaller')}
          data-tip={t('blFontSmaller')}
          disabled={fontSize <= BILINGUAL_FONT_MIN}
          onClick={() => props.onFontSize(fontSize - 1)}
        >
          A−
        </button>
        <span className="bl-bar-font-size">{fontSize}</span>
        <button
          type="button"
          className="bl-bar-btn"
          aria-label={t('blFontLarger')}
          data-tip={t('blFontLarger')}
          disabled={fontSize >= BILINGUAL_FONT_MAX}
          onClick={() => props.onFontSize(fontSize + 1)}
        >
          A+
        </button>
      </span>
      {load.kind === 'loading' && (
        <span className="bl-bar-status" role="status">
          {load.total > 0
            ? t('blLoading', { done: load.done, total: load.total })
            : t('blLoadingStart')}
        </span>
      )}
      {load.kind === 'failed' && (
        <span className="bl-bar-status bl-bar-error" role="status">
          {t('blFailed')}
        </span>
      )}
      {load.kind === 'unavailable' && (
        <span className="bl-bar-status bl-bar-error" role="status">
          {t('blUnavailable')}
        </span>
      )}
      {props.unsavedPageEdits && (
        <span className="bl-bar-status bl-bar-notice" role="status">
          {t('blUnsavedPages')}
        </span>
      )}
      {props.askCollapse && (
        <span className="bl-bar-ask" role="alert">
          <span>{t('blCollapseAsk')}</span>
          <button type="button" className="bl-bar-btn" onClick={props.onCollapse}>
            {t('blCollapse')}
          </button>
          <button type="button" className="bl-bar-btn" onClick={props.onDismissCollapse}>
            {t('blKeep')}
          </button>
        </span>
      )}
      <span className="bl-bar-spacer" />
      {props.actions}
      <button
        type="button"
        className="bl-bar-btn bl-bar-close"
        aria-label={t('blClose')}
        data-tip={t('blClose')}
        onClick={props.onClose}
      >
        ×
      </button>
    </div>
  )
}
