/**
 * The dock at the right end of the editor: the AI panel, the memo panel, or the
 * rail while the dock is collapsed. This editor has no ribbon, so the rail is
 * the only way in.
 *
 * The AI panel and the memo panel share the dock (spec 3.1): one is out at a
 * time, the dock's collapsed state is the app's, and both panels stay mounted
 * while folded, so a run, its chat and the memo list survive.
 *
 * In a split the shell gives this view's pane a role (decision 0036): only the
 * focus pane shows a panel, while a secondary pane keeps the dock folded to the
 * rail. A click on the rail asks the shell to focus this pane and remembers the
 * panel as open, so it appears once focus arrives.
 */
import type { ReactElement } from 'react'
import {
  AiMark,
  aiSubscriptionText,
  effectiveAiPanelOpen,
  onAiRailClick,
  useSplitPaneRole,
} from '@genoffice/ui'
import type { TemplateDocument } from '@genoffice/ui'
import { useI18n } from '../i18n/locale'
import type { AgentBridge } from './agent-bridge'
import { AiPanel } from './AiPanel'
import { MemoPanel, type MemoNotice } from '../MemoPanel'

/** Which of the two panels the shared dock shows. */
export type HwpDockMode = 'ai' | 'memo'

export interface HwpAiDockProps {
  /** whether the user wants the dock out (a secondary pane still folds it) */
  open: boolean
  setOpen(open: boolean): void
  /** the document operations of the open editor */
  bridge: AgentBridge
  /** the file of the open document: the conversation is kept with it */
  filePath: string | null
  /** the document while it can go along as a skill's template (spec 5.7) */
  templateDocument?: TemplateDocument | null
  /** the panel out now; without a mode the dock keeps its single AI panel */
  mode?: HwpDockMode
  setMode?(mode: HwpDockMode): void
  /** a memo editor is open here or in another tab: the app holds back save and close */
  onMemoModalOpenChange?(open: boolean): void
  /** one-time memo news for the app's notice line */
  onMemoNotice?(notice: MemoNotice): void
  /** bumped when the document may have changed: the memo list is read again */
  memoChangeTick?: number
  /** bumped when the editor's Insert > Memo menu asks for the add dialog (T4) */
  memoInsertTick?: number
}

const IGNORE = (): void => {}

/** The panel at the right end, or its rail while collapsed; both panels stay mounted. */
export function HwpAiDock({
  open,
  setOpen,
  bridge,
  filePath,
  templateDocument,
  mode,
  setMode,
  onMemoModalOpenChange,
  onMemoNotice,
  memoChangeTick = 0,
  memoInsertTick = 0,
}: HwpAiDockProps): ReactElement {
  const { lang, t } = useI18n()
  const { role, requestFocus } = useSplitPaneRole()
  const shown = effectiveAiPanelOpen(open, role)
  const memoDock = mode !== undefined && setMode !== undefined
  const memoShown = shown && mode === 'memo'

  return (
    <div className={`ai-dock${shown ? '' : ' collapsed'}${memoDock ? ` mode-${mode}` : ''}`}>
      {!shown &&
        (memoDock ? (
          <div className="ai-rail-group">
            <button
              type="button"
              className="ai-rail ai-entry"
              data-tip={t('aiOpenAssistant')}
              aria-label={aiSubscriptionText(lang, 'aiAssistant')}
              onClick={() => {
                setMode('ai')
                onAiRailClick(role, open, setOpen, requestFocus)
              }}
            >
              <AiMark size={22} />
            </button>
            <button
              type="button"
              className="ai-rail memo-rail ai-entry"
              data-tip={t('memoOpen')}
              aria-label={t('memoOpen')}
              onClick={() => {
                setMode('memo')
                // a secondary pane asks for focus first, then remembers the dock as open
                if (role === 'secondary') {
                  requestFocus()
                  setOpen(true)
                } else setOpen(!open)
              }}
            >
              <span className="memo-rail-label">{t('memoOpen')}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="ai-rail ai-entry"
            data-tip={t('aiOpenAssistant')}
            aria-label={aiSubscriptionText(lang, 'aiAssistant')}
            onClick={() => onAiRailClick(role, open, setOpen, requestFocus)}
          >
            <AiMark size={22} />
          </button>
        ))}
      <AiPanel
        bridge={bridge}
        filePath={filePath}
        onCollapse={() => setOpen(false)}
        templateDocument={templateDocument}
        onSkillHandoff={() => setOpen(true)}
      />
      {memoDock && (
        <MemoPanel
          open={memoShown}
          bridge={bridge}
          changeTick={memoChangeTick}
          insertTick={memoInsertTick}
          onCollapse={() => setOpen(false)}
          onModalOpenChange={onMemoModalOpenChange ?? IGNORE}
          onNotice={onMemoNotice ?? IGNORE}
        />
      )}
    </div>
  )
}
