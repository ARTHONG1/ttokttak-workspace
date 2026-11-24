import { describe, expect, it } from 'vitest'
import { OrganizeService, ORGANIZE_ERRORS } from '../src/main/organize/service'
import { recodePdfImageInJs, recodePictureInJs } from '../src/main/organize/pictures'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('똑딱정리 concurrent requests', () => {
  it('keeps two overlapping opens from replacing one another', async () => {
    const pending = deferred<number>()
    const service = new OrganizeService({
      fileSize: async () => pending.promise,
      readFile: async () => new Uint8Array(),
      recodePicture: recodePictureInJs,
      recodePdfImage: recodePdfImageInJs,
    })
    const first = service.open(['/one.pdf', '/two.pdf'])
    const second = service.open(['/three.pdf', '/four.pdf'])
    pending.resolve(10)
    expect(await second).toEqual({
      ok: false,
      error: ORGANIZE_ERRORS.busy,
    })
    const opened = await first
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(opened.files.map((f) => f.name)).toEqual(['one', 'two'])
    expect(service.familyOf(opened.token)).toBe('pdf')
  })

  it('serializes an add with other adds, opens and runs', async () => {
    const pending = deferred<number>()
    let blockAdd = false
    const service = new OrganizeService({
      fileSize: async () => (blockAdd ? pending.promise : 10),
      readFile: async () => new Uint8Array(),
      recodePicture: recodePictureInJs,
      recodePdfImage: recodePdfImageInJs,
    })
    const opened = await service.open(['/one.pdf', '/two.pdf'])
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    blockAdd = true
    const first = service.add(opened.token, ['/three.pdf'])
    const second = service.add(opened.token, ['/four.pdf'])
    const anotherOpen = service.open(['/five.pdf', '/six.pdf'])
    const run = service.run({ token: opened.token, action: 'merge' }, () => {})
    pending.resolve(10)
    expect(await second).toEqual({
      ok: false,
      error: ORGANIZE_ERRORS.busy,
    })
    expect(await anotherOpen).toEqual({
      ok: false,
      error: ORGANIZE_ERRORS.busy,
    })
    expect(await run).toEqual({
      ok: false,
      error: ORGANIZE_ERRORS.busy,
    })
    const result = await first
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.files.map((f) => f.name)).toEqual(['one', 'two', 'three'])
  })

  it('forgets an open session after the page closes during a running operation', async () => {
    const pending = deferred<Uint8Array>()
    const service = new OrganizeService({
      fileSize: async () => 10,
      readFile: async () => pending.promise,
      recodePicture: recodePictureInJs,
      recodePdfImage: recodePdfImageInJs,
    })
    const opened = await service.open(['/one.pdf', '/two.pdf'])
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    const running = service.run({ token: opened.token, action: 'merge' }, () => {})
    service.close(opened.token)
    pending.resolve(new Uint8Array())
    await running
    expect(service.familyOf(opened.token)).toBeNull()
  })

  it('returns null if a PDF preview cannot be read', async () => {
    const service = new OrganizeService({
      fileSize: async () => 10,
      readFile: async () => {
        throw new Error('file went away')
      },
      recodePicture: recodePictureInJs,
      recodePdfImage: recodePdfImageInJs,
    })
    const opened = await service.open(['/one.pdf', '/two.pdf'])
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    await expect(service.pdfBytes(opened.token, opened.files[0]!.id)).resolves.toBeNull()
  })

  it('refuses a merge order that contains a missing file identifier', async () => {
    const service = new OrganizeService({
      fileSize: async () => 10,
      readFile: async () => {
        throw new Error('should not read')
      },
      recodePicture: recodePictureInJs,
      recodePdfImage: recodePdfImageInJs,
    })
    const opened = await service.open(['/one.pdf', '/two.pdf'])
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    await expect(
      service.run(
        { token: opened.token, action: 'merge', order: [opened.files[0]!.id, 'missing'] },
        () => {},
      ),
    ).resolves.toEqual({ ok: false, error: ORGANIZE_ERRORS.again })
  })
})
