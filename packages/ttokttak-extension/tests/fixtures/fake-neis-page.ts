// Browser test page: a stand-in for a NEIS entry screen with its student grid.
// ?stuck=N makes Tab stay on row N (0 first); ?filled=1 puts a text into the first row.
import { mountFakeNeis } from './fake-neis-grid'

const q = new URLSearchParams(location.search)
addEventListener('DOMContentLoaded', () => {
  const stuck = q.get('stuck')
  const fake = mountFakeNeis(
    document,
    [
      { name: '김하늘', text: q.get('filled') === '1' ? '지난 학기 글.' : '' },
      { name: '이바다' },
      { name: '박나래' },
      { name: '최우주' },
    ],
    stuck === null ? {} : { stuckAt: Number(stuck) },
  )
  Object.assign(window, { __neis: fake })
})
