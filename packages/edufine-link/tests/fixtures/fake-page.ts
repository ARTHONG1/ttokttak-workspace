// Browser test page: puts the fake K-에듀파인 objects where the real page has nexacro.
// ?frame=1 wraps the screen in a same-origin frame the way a portal page can; the objects
// then live in that frame (?inner=1) and the top page has none.
import { DEFAULT_SCREEN_MAP } from '../../src/screen-map'
import { makeFakeEdufine, pumuiScreen } from './fake-nexacro'

const q = new URLSearchParams(location.search)
if (q.get('frame') === '1') {
  addEventListener('DOMContentLoaded', () => {
    const frame = document.createElement('iframe')
    frame.src = 'fake-edufine.html?inner=1' + (q.get('budget') === '0' ? '&budget=0' : '')
    frame.title = '업무 화면'
    frame.style.cssText = 'width:100%;height:300px;border:0'
    document.body.append(frame)
  })
} else {
  const fake = makeFakeEdufine(
    pumuiScreen(DEFAULT_SCREEN_MAP, {
      budgetSelected: q.get('budget') !== '0',
      startOn: q.get('screen') === 'other' ? 'other' : 'pumui',
    }),
  )
  Object.assign(window, { nexacro: fake.nx, __fake: fake })
}
