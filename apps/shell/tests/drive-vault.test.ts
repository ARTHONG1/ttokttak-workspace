import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDriveVault, type SecretCipher } from '../src/main/drive/drive-vault'

/** reversible stand-in for the OS cipher; marks its output so plain text would show */
const cipher = (available = true): SecretCipher => ({
  available: () => available,
  encrypt: (text) => Buffer.from(`enc:${[...text].reverse().join('')}`),
  decrypt: (bytes) => [...bytes.toString().slice(4)].reverse().join(''),
})

describe('createDriveVault', () => {
  it('keeps the token encrypted and reads it back', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'vault-')), 'google-drive.json')
    const vault = createDriveVault(file, cipher())
    expect(await vault.save('refresh-token-1')).toBe(true)
    expect(readFileSync(file, 'utf8')).not.toContain('refresh-token-1')
    expect(await vault.load()).toBe('refresh-token-1')
    await vault.clear()
    expect(existsSync(file)).toBe(false)
    expect(await vault.load()).toBeNull()
  })

  it('writes nothing when the system cannot encrypt', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'vault-')), 'google-drive.json')
    const vault = createDriveVault(file, cipher(false))
    expect(await vault.save('refresh-token-1')).toBe(false)
    expect(existsSync(file)).toBe(false)
  })

  it('reads a damaged file as no token', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'vault-')), 'google-drive.json')
    const vault = createDriveVault(file, {
      ...cipher(),
      decrypt: () => {
        throw new Error('another user')
      },
    })
    await vault.save('x')
    expect(await vault.load()).toBeNull()
  })
})
