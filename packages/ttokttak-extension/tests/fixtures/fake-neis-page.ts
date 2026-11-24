// Browser test page: a stand-in for a NEIS entry screen with its student grid.
// ?stuck=N makes Tab stay on row N (0 first); ?filled=1 puts a text into the first row.
import { mountFakeNeis } from './fake-neis-grid'

const q = new URLSearchParams(location.search)
function showGrid() {
  const stuck = q.get('stuck')
  const mode = q.get('mode')
  const column =
    mode === 'behavior'
      ? '행동특성 및 종합의견'
      : mode === 'activity'
        ? '특기사항(자율활동)'
        : '세부능력 및 특기사항'
  const fake = mountFakeNeis(
    document,
    [
      { name: '김하늘', text: q.get('filled') === '1' ? '지난 학기 글.' : '' },
      { name: '이바다' },
      { name: '박나래' },
      { name: '최우주' },
    ],
    { column, ...(stuck === null ? {} : { stuckAt: Number(stuck) }) },
  )
  Object.assign(window, { __neis: fake })
  document.documentElement.setAttribute('data-ttok-fake-neis', '')
}

addEventListener('DOMContentLoaded', () => {
  if (!q.has('login')) return showGrid()
  const login = document.createElement('button')
  login.textContent = '로그인'
  login.addEventListener('click', () => {
    login.remove()
    showGrid()
  })
  document.body.append(login)
})
