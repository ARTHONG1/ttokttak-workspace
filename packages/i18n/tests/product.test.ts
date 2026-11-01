import { describe, expect, it } from 'vitest'
import {
  brandText,
  createI18n,
  DEV_USER_DATA_DIR_NAME,
  LANGS,
  PRODUCT_NAME,
  PRODUCT_REPO_NAME,
  PRODUCT_REPO_OWNER,
  PRODUCT_REPO_SLUG,
  productName,
  UPSTREAM_NAME_LITERAL,
  UPSTREAM_PRODUCT_NAME,
  USER_DATA_DIR_NAME,
  type LangDicts,
} from '../src/index'

describe('productName', () => {
  it('uses the same Korean product name in every locale', () => {
    expect(productName('ko')).toBe('똑딱작업실')
    for (const lang of LANGS) {
      expect(productName(lang), lang).toBe('똑딱작업실')
    }
  })

  it('accepts raw locale tags and falls back to the unified name', () => {
    expect(productName('ko-KR')).toBe('똑딱작업실')
    expect(productName('KO_kr')).toBe('똑딱작업실')
    expect(productName('en-US')).toBe('똑딱작업실')
    expect(productName('')).toBe('똑딱작업실')
    expect(productName(undefined)).toBe('똑딱작업실')
    expect(productName(null)).toBe('똑딱작업실')
  })

  it('keeps the unified display name as the one PRODUCT_NAME definition', () => {
    expect(PRODUCT_NAME).toBe('똑딱작업실')
    expect(productName('en')).toBe(PRODUCT_NAME)
  })
})

describe('brandText', () => {
  it('swaps the upstream name for the product name of the language', () => {
    expect(brandText('Welcome to GenOffice', 'en')).toBe('Welcome to 똑딱작업실')
    expect(brandText('GenOffice에 오신 것을 환영합니다', 'ko')).toBe(
      '똑딱작업실에 오신 것을 환영합니다',
    )
    expect(brandText('GenOffice のインストール', 'ja')).toBe('똑딱작업실 のインストール')
    expect(brandText('关于 GenOffice', 'zh')).toBe('关于 똑딱작업실')
  })

  it('replaces every occurrence, including sub-app names and compounds', () => {
    expect(brandText('GenOffice Docs and GenOffice Sheets', 'en')).toBe(
      '똑딱작업실 Docs and 똑딱작업실 Sheets',
    )
    expect(brandText('GenOffice Markdown', 'ko')).toBe('똑딱작업실 Markdown')
    expect(brandText('das GenOffice-Fenster', 'de')).toBe('das 똑딱작업실-Fenster')
    expect(brandText("GenOffice's window", 'en')).toBe("똑딱작업실's window")
  })

  it('returns strings without the name untouched', () => {
    const plain = 'Save the file with ⌘S'
    expect(brandText(plain, 'ko')).toBe(plain)
    expect(brandText('', 'ko')).toBe('')
    // the command line and package names are lowercase and are not the display name
    expect(brandText('run `genoffice open` (@genoffice/cli, GENOFFICE_USER_DATA)', 'ko')).toBe(
      'run `genoffice open` (@genoffice/cli, GENOFFICE_USER_DATA)',
    )
  })

  it('prints the literal upstream name where the text escapes it', () => {
    expect(UPSTREAM_PRODUCT_NAME).toBe('GenOffice')
    expect(UPSTREAM_NAME_LITERAL).toBe('{{GenOffice}}')
    expect(brandText('Based on {{GenOffice}}', 'en')).toBe('Based on GenOffice')
    expect(brandText('{{GenOffice}}를 바탕으로 만들었습니다', 'ko')).toBe(
      'GenOffice를 바탕으로 만들었습니다',
    )
    expect(brandText('GenOffice is based on {{GenOffice}}.', 'en')).toBe(
      '똑딱작업실 is based on GenOffice.',
    )
    expect(brandText('GenOffice는 {{GenOffice}}를 바탕으로 합니다.', 'ko')).toBe(
      '똑딱작업실은 GenOffice를 바탕으로 합니다.',
    )
  })

  it('uses the unified product name inside file and folder names in every language', () => {
    expect(brandText('chmod +x GenOffice-<version>.AppImage', 'ko')).toBe(
      'chmod +x 똑딱작업실-<version>.AppImage',
    )
    expect(brandText('문서/GenOffice 폴더', 'ko')).toBe('문서/똑딱작업실 폴더')
    expect(brandText('%APPDATA%\\GenOffice', 'ko')).toBe('%APPDATA%\\똑딱작업실')
    expect(brandText('GenOffice.exe를 실행합니다', 'ko')).toBe('똑딱작업실.exe를 실행합니다')
    // a sentence-ending period is not a file extension
    expect(brandText('이것은 GenOffice. 다음 문장', 'ko')).toBe('이것은 똑딱작업실. 다음 문장')
    expect(brandText('GenOffice.', 'ko')).toBe('똑딱작업실.')
  })

  it('leaves identifiers that merely contain the name alone', () => {
    expect(brandText('GenOfficeFormField', 'en')).toBe('GenOfficeFormField')
    expect(brandText('_GenOfficeCoverPage', 'en')).toBe('_GenOfficeCoverPage')
    expect(brandText('MyGenOffice', 'en')).toBe('MyGenOffice')
  })
})

describe('createI18n product name', () => {
  const dicts = {
    zh: { about: '关于 GenOffice', ack: '基于 {{GenOffice}}', open: '用 GenOffice 打开 {name}' },
    en: {
      about: 'About GenOffice',
      ack: 'Based on {{GenOffice}}',
      open: 'Open {name} in GenOffice',
    },
    ko: {
      about: 'GenOffice 정보',
      ack: '{{GenOffice}} 기반',
      open: 'GenOffice에서 {name} 열기',
    },
  } as unknown as LangDicts<{ about: string; ack: string; open: string }>
  const t = createI18n(dicts)

  it('renders the product name of the requested language', () => {
    expect(t('en', 'about')).toBe('About 똑딱작업실')
    expect(t('zh', 'about')).toBe('关于 똑딱작업실')
    expect(t('ko', 'about')).toBe('똑딱작업실 정보')
  })

  it('keeps the upstream name in the acknowledgement', () => {
    expect(t('en', 'ack')).toBe('Based on GenOffice')
    expect(t('zh', 'ack')).toBe('基于 GenOffice')
    expect(t('ko', 'ack')).toBe('GenOffice 기반')
  })

  it('never rewrites interpolated values (a file may be called GenOffice)', () => {
    expect(t('en', 'open', { name: 'GenOffice notes.docx' })).toBe(
      'Open GenOffice notes.docx in 똑딱작업실',
    )
    expect(t('ko', 'open', { name: 'GenOffice.docx' })).toBe('똑딱작업실에서 GenOffice.docx 열기')
  })

  it('brands the fallback text of a language without its own entry', () => {
    expect(t('fr', 'about')).toBe('About 똑딱작업실')
  })
})

describe('registered names derived from the product name', () => {
  it('names the userData folders after the Latin product name', () => {
    expect(USER_DATA_DIR_NAME).toBe('HangulAIWorkbench')
    expect(DEV_USER_DATA_DIR_NAME).toBe('HangulAIWorkbench-Dev')
    expect(USER_DATA_DIR_NAME).not.toBe(UPSTREAM_PRODUCT_NAME)
  })

  it('names the public repository once', () => {
    expect(PRODUCT_REPO_OWNER).toBe('ARTHONG1')
    expect(PRODUCT_REPO_NAME).toBe('ttokttak-workspace')
    expect(PRODUCT_REPO_SLUG).toBe('ARTHONG1/ttokttak-workspace')
  })
})
