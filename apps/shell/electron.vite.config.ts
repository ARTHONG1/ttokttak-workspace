import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// 똑딱서명 draws pages with pdf.js: CJK CMaps, standard fonts and its wasm decoders ship
// with the renderer output (as in apps/pdf), under pdfjs/
const require = createRequire(import.meta.url)
const pdfjsRoot = dirname(dirname(require.resolve('pdfjs-dist/package.json')))
// vite-plugin-static-copy globs require POSIX separators; join() breaks on Windows
const pdfjsDir = (sub: string) => normalizePath(join(pdfjsRoot, 'pdfjs-dist', sub))

// 문서 변환's PDF → Hangul stage uses kordoc, which loads cfb with a run-time require the
// bundle cannot see (and the installed app and the web image cannot resolve, having no
// node_modules for it): turn that require into an import so cfb is bundled with it.
const kordocCfbImport = {
  name: 'kordoc-cfb-import',
  transform(code: string, id: string) {
    if (!/[\\/]kordoc[\\/]dist[\\/]/.test(id)) return null
    const out = code.replace(
      /var (\w+) = require\d*\("cfb"\);/g,
      (_line, name: string) =>
        'import * as ' +
        name +
        '_ns from "cfb";\nvar ' +
        name +
        ' = ' +
        name +
        '_ns.default ?? ' +
        name +
        '_ns;',
    )
    // a newer kordoc may load it another way: stop the build rather than ship a crash
    if (/require\w*\(\s*["']cfb["']\s*\)/.test(out)) {
      throw new Error('kordoc still requires cfb at run time in ' + id + ': update kordocCfbImport')
    }
    return out === code ? null : { code: out, map: null }
  },
}

// kordoc's OCR, image and browser paths (not used: 문서 변환 reads Word documents with it)
const KORDOC_UNUSED = [
  'onnxruntime-node',
  'sharp',
  '@hyzyla/pdfium',
  'puppeteer-core',
  '@huggingface/tokenizers',
]

export default defineConfig({
  // Bundle everything into the shell main (same policy as apps/docs): the
  // imported docs/sheets main modules are TS source with no build artifacts,
  // so externalizing them would break Node ESM resolution at runtime.
  main: {
    plugins: [kordocCfbImport],
    // node:sqlite is a Node 22+ builtin the bundler's builtin list may predate
    build: { rollupOptions: { external: ['node:sqlite', ...KORDOC_UNUSED] } },
    // the Google client for Drive (decision 0033) comes from the build's
    // environment only; without it the build offers no Drive at all
    define: {
      __GENOFFICE_GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GENOFFICE_GOOGLE_CLIENT_ID ?? ''),
      __GENOFFICE_GOOGLE_CLIENT_SECRET__: JSON.stringify(
        process.env.GENOFFICE_GOOGLE_CLIENT_SECRET ?? '',
      ),
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          // dedicated preload for the auto-update window
          update: resolve(__dirname, 'src/preload/update.ts'),
          // dedicated preload for the PDF password prompt window
          'pdf-password': resolve(__dirname, 'src/preload/pdf-password.ts'),
          // dedicated preload for the generate window (see src/main/generate/generate-window.ts)
          generate: resolve(__dirname, 'src/preload/generate.ts'),
          // dedicated preload for the PDF tools window (see src/main/pdf-tools/pdf-tools-window.ts)
          'pdf-tools': resolve(__dirname, 'src/preload/pdf-tools.ts'),
          // dedicated preload for the agent window (see src/main/agent/agent-window.ts)
          agent: resolve(__dirname, 'src/preload/agent.ts'),
          // dedicated preload for the attach-from-Drive window (see src/main/drive/drive-picker-window.ts)
          'drive-picker': resolve(__dirname, 'src/preload/drive-picker.ts'),
          // dedicated preload for the attach-a-document window (see src/main/doc-picker/doc-picker-window.ts)
          'doc-picker': resolve(__dirname, 'src/preload/doc-picker.ts'),
          // dedicated preload for the Quick Look preview window (see src/main/quick-look/quick-look-window.ts)
          'quick-look': resolve(__dirname, 'src/preload/quick-look.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          { src: pdfjsDir('cmaps'), dest: 'pdfjs' },
          { src: pdfjsDir('standard_fonts'), dest: 'pdfjs' },
          { src: pdfjsDir('wasm'), dest: 'pdfjs' },
        ],
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // strong-guidance update window (see src/main/update-window.ts)
          update: resolve(__dirname, 'src/renderer/update.html'),
          // PDF password prompt window (see src/main/pdf-password-dialog.ts)
          'pdf-password': resolve(__dirname, 'src/renderer/pdf-password.html'),
          // generate window (see src/main/generate/generate-window.ts)
          generate: resolve(__dirname, 'src/renderer/generate.html'),
          // PDF tools window (see src/main/pdf-tools/pdf-tools-window.ts)
          'pdf-tools': resolve(__dirname, 'src/renderer/pdf-tools.html'),
          // agent window (see src/main/agent/agent-window.ts)
          agent: resolve(__dirname, 'src/renderer/agent.html'),
          // attach-from-Drive window (see src/main/drive/drive-picker-window.ts)
          'drive-picker': resolve(__dirname, 'src/renderer/drive-picker.html'),
          // attach-a-document window (see src/main/doc-picker/doc-picker-window.ts)
          'doc-picker': resolve(__dirname, 'src/renderer/doc-picker.html'),
          // Quick Look preview window (see src/main/quick-look/quick-look-window.ts)
          'quick-look': resolve(__dirname, 'src/renderer/quick-look.html'),
        },
      },
    },
    server: {
      port: Number(process.env.SHELL_DEV_PORT) || 5199,
      strictPort: Boolean(process.env.SHELL_DEV_PORT),
    },
  },
})
