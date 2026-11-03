#!/usr/bin/env node
// Sends one native messaging request to an installed edufine-host launcher the way Chrome
// does (4-byte length + JSON on stdin) and prints the reply. Used by the Windows CI job and
// for checking a school PC by hand:
//   node host-roundtrip.mjs "C:\...\resources\cli\edufine-host.cmd" ping
import { spawn } from 'node:child_process'

const [host, type = 'ping'] = process.argv.slice(2)
if (!host) {
  console.error('usage: node host-roundtrip.mjs <edufine-host launcher> [ping|take]')
  process.exit(2)
}
const body = Buffer.from(JSON.stringify({ type }))
const head = Buffer.alloc(4)
head.writeUInt32LE(body.length, 0)
const win = process.platform === 'win32'
// a .cmd needs the shell on Windows, and the shell takes the command line as written:
// quote the launcher so an install folder with spaces (C:\Users\홍 길동\…) stays one path
const child = spawn(win ? '"' + host + '"' : host, ['chrome-extension://ebjaejdjilpnbcbcejmeeneahkngcmnm/'], {
  shell: win,
  stdio: ['pipe', 'pipe', 'inherit'],
})
const chunks = []
child.stdout.on('data', (c) => chunks.push(c))
const timer = setTimeout(() => {
  console.error('no reply within 60 s')
  child.kill()
  process.exit(1)
}, 60_000)
child.on('close', () => {
  clearTimeout(timer)
  const out = Buffer.concat(chunks)
  if (out.length < 4) {
    console.error('no framed reply (' + out.length + ' bytes)')
    process.exit(1)
  }
  const len = out.readUInt32LE(0)
  console.log(out.subarray(4, 4 + len).toString('utf8'))
})
child.stdin.end(Buffer.concat([head, body]))

