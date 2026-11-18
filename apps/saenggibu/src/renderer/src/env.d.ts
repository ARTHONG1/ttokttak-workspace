import type { SaenggibuApi } from '../../shared/api'

declare global {
  interface Window {
    saenggibu: SaenggibuApi
  }
}
