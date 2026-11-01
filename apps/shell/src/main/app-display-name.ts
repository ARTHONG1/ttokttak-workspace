import { productName } from '@genoffice/i18n'

export function applyDisplayName(app: {
  getPath(name: 'userData'): string
  setPath(name: 'userData', path: string): void
  setName(name: string): void
}): void {
  const userData = app.getPath('userData')
  app.setName(productName('ko'))
  app.setPath('userData', userData)
}
