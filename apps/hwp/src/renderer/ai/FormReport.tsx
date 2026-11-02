import type { ReactElement } from 'react'
import type { TFunc } from '../i18n/locale'
import type { FormMode, FormProfile } from './form-guard'

/** Where the analysis made when the document opened stands. */
export type FormStatus = 'analyzing' | 'ready' | 'failed'

/** Tables listed one by one in the report; the rest are counted. */
const REPORT_MAX_TABLES = 5

/**
 * The form analysis, reported as the first message of the conversation: what was found
 * and how the AI keeps it now. It is drawn from the analysis, never stored in the
 * conversation, and never sent to the model (the model gets the analysis in its context).
 */
export function FormReport({
  status,
  profile,
  mode,
  t,
}: {
  status: FormStatus
  profile: FormProfile | null
  mode: FormMode
  t: TFunc
}): ReactElement {
  const rule = mode === 'lock' ? t('formReportLock') : t('formReportKeep')
  if (status === 'analyzing') {
    return (
      <div className="ai-msg ai-msg-assistant ai-form-report" role="status">
        <div className="ai-form-report-title">{t('formReportAnalyzing')}</div>
      </div>
    )
  }
  if (status === 'failed' || !profile) {
    return (
      <div className="ai-msg ai-msg-assistant ai-form-report">
        <div className="ai-form-report-title">{t('formReportFailed')}</div>
        <div className={`ai-form-report-rule${mode === 'lock' ? ' on' : ''}`}>{rule}</div>
      </div>
    )
  }
  const listed = profile.tables.slice(0, REPORT_MAX_TABLES)
  const more = profile.tableCount - listed.length
  return (
    <div className="ai-msg ai-msg-assistant ai-form-report">
      <div className="ai-form-report-title">{t('formReportTitle')}</div>
      <div className="ai-form-report-summary">
        {t('formReportSummary', {
          pages: profile.pages,
          tables: profile.tableCount,
          empty: profile.emptyCells,
          fields: profile.fields,
        })}
      </div>
      {listed.length > 0 && (
        <ul className="ai-form-report-tables">
          {listed.map((table) => (
            <li key={table.table}>
              {t('formReportTable', {
                table: table.table,
                rows: table.rows,
                cols: table.cols,
                empty: table.emptyCells,
              })}
              {table.near && (
                <span className="ai-form-report-near">
                  {' · '}
                  {t('formReportNear', { near: table.near })}
                </span>
              )}
            </li>
          ))}
          {more > 0 && <li>{t('formReportMore', { count: more })}</li>}
        </ul>
      )}
      {profile.lists && profile.lists.length > 0 && (
        <div className="ai-form-report-lists">
          {t('formReportLists', {
            lists: profile.lists.map((list) => `${list.marker} ×${list.count}`).join(', '),
          })}
        </div>
      )}
      <div className={`ai-form-report-rule${mode === 'lock' ? ' on' : ''}`}>{rule}</div>
    </div>
  )
}

/** The 서식 고정 switch, in the composer next to the model picker. */
export function FormLockToggle({
  mode,
  onChange,
  t,
}: {
  mode: FormMode
  onChange(mode: FormMode): void
  t: TFunc
}): ReactElement {
  const on = mode === 'lock'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`ai-form-lock${on ? ' on' : ''}`}
      data-tip={t('formLockTip')}
      onClick={() => onChange(on ? 'keep' : 'lock')}
    >
      <span className="ai-form-lock-knob" aria-hidden />
      <span className="ai-form-lock-text">{t('formLock')}</span>
    </button>
  )
}
