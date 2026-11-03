/**
 * The panel drawn over the K-에듀파인 page: a small 똑딱 button at the bottom right and
 * a panel in a shadow root, so neither side's styles leak into the other.
 */
type Child = Node | string | null | undefined | false

export function h(tag: string, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener)
    else if (k === 'class') el.className = String(v)
    else if (k in el) (el as unknown as Record<string, unknown>)[k] = v
    else el.setAttribute(k, String(v))
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c)
  return el
}

const STYLE = String.raw`
:host { all: initial; }
* { box-sizing: border-box; font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; }
.fab { position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; border: 0; border-radius: 999px;
  padding: 10px 16px; background: #2f6bff; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer;
  box-shadow: 0 6px 18px rgba(30, 60, 140, .28); }
.panel { position: fixed; right: 20px; bottom: 72px; z-index: 2147483647; width: 420px; max-height: 76vh; overflow: auto;
  background: #fff; color: #1d2433; border-radius: 14px; box-shadow: 0 12px 40px rgba(20, 30, 60, .25); padding: 18px; font-size: 13px; }
.panel h2 { margin: 0 0 4px; font-size: 16px; }
.sub { color: #667085; margin: 0 0 12px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
button.btn { border: 1px solid #d0d5dd; background: #fff; border-radius: 8px; padding: 8px 12px; font-size: 13px; cursor: pointer; }
button.primary { background: #2f6bff; border-color: #2f6bff; color: #fff; font-weight: 700; }
button:disabled { opacity: .45; cursor: not-allowed; }
textarea { width: 100%; height: 70px; border: 1px dashed #98a2b3; border-radius: 8px; padding: 8px; font-size: 12px; resize: none; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; }
td, th { border-bottom: 1px solid #eaecf0; padding: 5px 4px; text-align: left; font-size: 12px; }
td.num, th.num { text-align: right; }
.ok { color: #067647; } .bad { color: #b42318; } .na { color: #98a2b3; }
.note { background: #f5f8ff; border-radius: 8px; padding: 8px 10px; margin: 8px 0; }
.warn { background: #fff4ed; color: #b93815; border-radius: 8px; padding: 8px 10px; margin: 8px 0; }
.err { background: #fef3f2; color: #b42318; border-radius: 8px; padding: 8px 10px; margin: 8px 0; }
.done { background: #ecfdf3; color: #067647; border-radius: 8px; padding: 8px 10px; margin: 8px 0; }
.close { float: right; border: 0; background: none; font-size: 18px; cursor: pointer; color: #667085; }
`

export interface Panel {
  show(...content: Child[]): void
  hide(): void
  root: ShadowRoot
}

export function mountPanel(onOpen: () => void): Panel {
  const host = h('div', { id: 'ttok-edufine-host' })
  const root = host.attachShadow({ mode: 'open' })
  root.append(h('style', {}, STYLE))
  const panel = h('div', { class: 'panel', hidden: true, role: 'dialog', 'aria-label': '똑딱 에듀파인 연결' })
  const fab = h('button', { class: 'fab', type: 'button', onclick: () => (panel.hidden ? onOpen() : (panel.hidden = true)) }, '똑딱')
  root.append(fab, panel)
  document.documentElement.append(host)
  return {
    root,
    show(...content: Child[]) {
      panel.replaceChildren(h('button', { class: 'close', type: 'button', 'aria-label': '닫기', onclick: () => (panel.hidden = true) }, '×'), ...content.filter(Boolean) as Node[])
      panel.hidden = false
    },
    hide() {
      panel.hidden = true
    },
  }
}

export const won = (n: number): string => n.toLocaleString('ko-KR') + '원'

