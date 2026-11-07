import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appBinaryForResources } from '../src/resources'

describe('appBinaryForResources', () => {
  it('finds the app in a custom Windows install directory', () => {
    expect(appBinaryForResources(join('D:\\Apps\\HangulAIWorkbench', 'resources'), 'win32')).toBe(
      join('D:\\Apps\\HangulAIWorkbench', 'HangulAIWorkbench.exe'),
    )
  })

  it('resolves the same binary for the default Windows install directory', () => {
    const localAppData = 'C:\\Users\\test\\AppData\\Local'
    const resources = join(localAppData, 'Programs', 'HangulAIWorkbench', 'resources')
    expect(appBinaryForResources(resources, 'win32')).toBe(
      join(localAppData, 'Programs', 'HangulAIWorkbench', 'HangulAIWorkbench.exe'),
    )
  })

  it('finds the app in a custom macOS bundle location', () => {
    expect(
      appBinaryForResources(
        join('/Volumes/Work/HangulAIWorkbench.app/Contents/Resources'),
        'darwin',
      ),
    ).toBe(join('/Volumes/Work/HangulAIWorkbench.app/Contents/MacOS/HangulAIWorkbench'))
  })

  it('finds the app in a custom Linux prefix', () => {
    expect(appBinaryForResources(join('/opt/ttokttak-custom/resources'), 'linux')).toBe(
      join('/opt/ttokttak-custom/ttokttak'),
    )
  })
})
