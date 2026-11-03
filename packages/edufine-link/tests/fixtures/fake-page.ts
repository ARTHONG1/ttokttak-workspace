// Browser test page: puts the fake K-에듀파인 objects where the real page has nexacro.
import { DEFAULT_SCREEN_MAP } from '../../src/screen-map'
import { makeFakeEdufine, pumuiScreen } from './fake-nexacro'

const q = new URLSearchParams(location.search)
const fake = makeFakeEdufine(pumuiScreen(DEFAULT_SCREEN_MAP, { budgetSelected: q.get('budget') !== '0' }))
Object.assign(window, { nexacro: fake.nx, __fake: fake })

