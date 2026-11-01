import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appBinaryForResources } from '../src/resources'
import { tempDir } from './helpers'

describe('appBinaryForResources', () => {
  it('finds the app in a custom Windows install directory', () => {
    expect(appBinaryForResources(join('D:\\Apps\\HangulAIWorkbench', 'resources'), 'win32')).toBe(
      join('D:\\Apps\\HangulAIWorkbench', '똑딱작업실.exe'),
    )
  })

  it('resolves the same binary for the default Windows install directory', () => {
    const localAppData = 'C:\\Users\\test\\AppData\\Local'
    const resources = join(localAppData, 'Programs', 'HangulAIWorkbench', 'resources')
    expect(appBinaryForResources(resources, 'win32')).toBe(
      join(localAppData, 'Programs', 'HangulAIWorkbench', '똑딱작업실.exe'),
    )
  })

  it('finds the app in a custom macOS bundle location', () => {
    expect(
      appBinaryForResources(join('/Volumes/Work/HangulAIWorkbench.app/Contents/Resources'), 'darwin'),
    ).toBe(join('/Volumes/Work/HangulAIWorkbench.app/Contents/MacOS/똑딱작업실'))
  })

  it('finds the app in a custom Linux prefix', () => {
    expect(appBinaryForResources(join('/opt/ieumoffice-custom/resources'), 'linux')).toBe(
      join('/opt/ieumoffice-custom/ieumoffice'),
    )
  })

  it('runs the legacy binary when bundled CLI belongs to an existing old macOS install', () => {
    const app = join(tempDir(), 'HangulAIWorkbench.app', 'Contents')
    mkdirSync(join(app, 'MacOS'), { recursive: true })
    writeFileSync(join(app, 'MacOS', 'HangulAIWorkbench'), '')
    expect(appBinaryForResources(join(app, 'Resources'), 'darwin')).toBe(
      join(app, 'MacOS', 'HangulAIWorkbench'),
    )
  })

  it('prefers the new executable when both versions exist in the same bundle', () => {
    const app = join(tempDir(), '똑딱작업실.app', 'Contents')
    mkdirSync(join(app, 'MacOS'), { recursive: true })
    writeFileSync(join(app, 'MacOS', 'HangulAIWorkbench'), '')
    writeFileSync(join(app, 'MacOS', '똑딱작업실'), '')
    expect(appBinaryForResources(join(app, 'Resources'), 'darwin')).toBe(
      join(app, 'MacOS', '똑딱작업실'),
    )
  })
})
