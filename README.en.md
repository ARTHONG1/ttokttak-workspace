<div align="center">

<img src="apps/shell/build/brand/app-icon.svg" width="88" alt="ttokttak-workspace icon" />

# ttokttak-workspace (똑딱작업실)

**An open-source AI workspace that takes the busywork out of documents**

Open a Hangul (HWP/HWPX), Word, Excel, PowerPoint or PDF file, say what to change, and the AI edits the document itself.<br />
Try it in the browser, or install it and connect your own AI agent.

[Web trial](https://hangul-ai-workbench-545101783843.asia-northeast3.run.app) · [Install with an AI agent](#install-with-an-ai-agent) · [한국어](README.md)

</div>

<p align="center"><a href="docs/assets/intro.mp4"><img src="docs/assets/intro-preview.gif" width="720" alt="ttokttak-workspace intro film preview" /></a></p>

## New: 똑딱서명 (sign a document)

Put a signature into a document without printing, signing and scanning it again. Open **똑딱업무 → 똑딱서명**.

1. **Upload a document**: a PDF, Hangul (HWP/HWPX), Word, Excel or PowerPoint file, or a photo, shown as a PDF. The web trial takes PDFs and photos.
2. **Make a signature**: draw it on the signature pad with a mouse, trackpad, pen or finger (shaky lines are smoothed, a pen's pressure sets the width), or upload a photo of a signature on paper and the paper is removed. The last three signatures are remembered, and each can be downloaded as a transparent PNG.
3. **Place it**: drag it, size it by a corner or the size slider, turn it freely by the handle or an angle, or put it at the same spot on every page.
4. **Save**: a PDF with the signature drawn into the page (`name_서명.pdf`), the same in every PDF viewer. It is a picture of a signature, not a certificate-based digital signature.

<p align="center">
  <img src="docs/assets/sign-pad.png" width="420" alt="Drawing a signature on the 똑딱서명 signature pad" />
  <img src="docs/assets/sign-placed.png" width="420" alt="A drawn signature sized and turned on a Hangul document converted to PDF" />
</p>

## Why

Most school and office work is document work: opening a file to change one title or a few numbers. ttokttak-workspace is built to take that repetitive work off people with AI, not only to edit documents. You say what to change, the AI changes it inside the document and shows what changed, and you check and decide. It is built on open source, and everything it adds is published back as open source.

## Three ways to use it

|           | Web trial                              | Desktop app                                    | Installed by your AI agent             |
| --------- | -------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| What      | In the browser, nothing to install     | macOS and Windows                              | One prompt does the whole setup        |
| AI        | Google Gemini (after Google sign-in)   | **Your own Claude Code or Codex** subscription | The same agent is connected to the app |
| Documents | Kept only while you work, then deleted | Stay on your PC                                | —                                      |

## Install with an AI agent

Paste this into Claude Code, Codex, Gemini CLI, Cursor or another coding agent:

```text
Install ttokttak-workspace on my computer and finish the setup.
Read https://github.com/ARTHONG1/ttokttak-workspace/blob/main/INSTALL.md and follow it exactly.
```

The agent picks the right file for your OS and CPU, downloads it from the official release only, checks it against the release's SHA-512, installs the app, puts a 똑딱작업실 shortcut on the Desktop, links the `ieumoffice` command, and registers the MCP server and the document skill with the coding agents on the PC. See [INSTALL.md](INSTALL.md) and `scripts/install/`.

## What it does

- One window for Hangul, Word, Excel, PowerPoint, PDF, Markdown, HTML and XMind files, saved in their own formats.
- An AI panel in every editor that reads, edits, marks the changes and undoes them in one step.
- HWPX saves that Hancom Hangul opens, checked before anything overwrites the original.
- School work tools: a purchase request generator, a quiz maker (Blooket CSV, QuizN XLSX, PDF, video), a word-search worksheet maker and 똑딱서명, which signs a document with a drawn or uploaded signature.
- A command line and MCP server (`ieumoffice`, `ieumoffice mcp`) for Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode and Windsurf.
- The app runs the Claude Code or Codex program you signed in to; it never reads or stores those logins.

## Privacy

The desktop app has no server of its own and sends no usage statistics; documents stay on your PC, and AI requests go to Anthropic or OpenAI under your own account. The web trial requires a Google sign-in, counts AI requests per account per day, keeps uploaded documents only in a temporary folder while you work (deleted 15 minutes after you leave) and sends AI requests to Google Vertex AI. See [PRIVACY.md](PRIVACY.md).

## Built on open source, published as open source

ttokttak-workspace is not written from scratch. It joins several open-source projects and fixes and fills in what got in the way at schools and offices. Thanks to the people who made them.

| Area                 | Open source                                                                                                                                                                                               | Role                                                                                  | Licence          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------- |
| App base             | [IeumOffice](https://github.com/pblsketch/openoffice) · [GenOffice](https://github.com/genspark-ai/genoffice)                                                                                             | Tabbed editors, an AI panel in each editor, subscription connection, document engines | Apache-2.0       |
| Hangul documents     | [rhwp](https://github.com/edwardkim/rhwp)                                                                                                                                                                 | Reading, writing and rendering HWP/HWPX                                               | MIT              |
| Spreadsheets         | [Univer](https://github.com/dream-num/univer) · [calamine](https://github.com/tafia/calamine)                                                                                                             | Calculation and grid, reading Excel files                                             | Apache-2.0 · MIT |
| Word and Markdown    | [Tiptap](https://github.com/ueberdosis/tiptap) · [ProseMirror](https://prosemirror.net)                                                                                                                   | Document editing                                                                      | MIT              |
| PDF                  | [PDF.js](https://github.com/mozilla/pdf.js) · [EmbedPDF](https://github.com/embedpdf/embed-pdf-viewer) (PDFium) · [qpdf](https://github.com/qpdf/qpdf) · [HarfBuzz](https://github.com/harfbuzz/harfbuzz) | Viewing, editing and saving PDF, fonts                                                | Apache-2.0 · MIT |
| Slides               | [frontend-slides](https://github.com/zarazhangrui/frontend-slides)                                                                                                                                        | Basis of the slide design templates                                                   | MIT              |
| Math, diagrams, code | [KaTeX](https://github.com/KaTeX/KaTeX) · [Mermaid](https://github.com/mermaid-js/mermaid) · [CodeMirror](https://github.com/codemirror/dev)                                                              | Formulas, diagrams, HTML source editing                                               | MIT              |
| App runtime          | [Electron](https://github.com/electron/electron) · [React](https://github.com/facebook/react)                                                                                                             | Desktop app and screens                                                               | MIT              |

It also uses 575 bundled open-source components, whose copyright notices and licences ship unchanged. Where each part of the code comes from and what was changed is stated exactly under [License and acknowledgement](#license-and-acknowledgement) and in [NOTICE](NOTICE).

What this project adds: HWPX saves that Hancom Hangul opens and that are validated before they overwrite a file, tables that split between pages, the browser trial edition (`web/`) with Google sign-in and per-account limits, the school work tools ported from the maker's 클래스똑딱 web tools, the agent-driven installer, and a Korean home screen and labels.

## Build from source

```bash
git clone https://github.com/ARTHONG1/ttokttak-workspace.git
cd ttokttak-workspace
npm install
npm run dev
```

Node 22.12+ (npm 10+) and Rust (`cargo` on the PATH) are required. See [CONTRIBUTING.md](CONTRIBUTING.md) for the checks a change must pass, and [llms.txt](llms.txt) for a map of the repository written for AI tools.

## License and acknowledgement

Licensed under the [Apache License 2.0](LICENSE). The code in this repository is a modified version of [IeumOffice](https://github.com/pblsketch/openoffice) 0.12.5 (commit `4e4e9cc`), which is based on [GenOffice](https://github.com/genspark-ai/genoffice); both are Apache-2.0 and their copyright notices are kept as written. Attribution and the summary of changes are in [NOTICE](NOTICE); every change is in the history. ttokttak-workspace is an independent project and is not affiliated with, sponsored or endorsed by the IeumOffice maintainers, Genspark / Mainfunc, Inc., Anthropic, OpenAI, Microsoft, Hancom, Adobe, XMind or Google. "IeumOffice", "이음오피스", "GenOffice" and "Genspark" belong to their owners, and the licence grants no trademark rights (section 6). "한글", "한컴", "HWP" and "HWPX" are registered trademarks of Hancom Inc.; other product names belong to their owners and are used only to say what this program opens and works with.

> 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.

Made by 홍찬우 (Incheon Bongsu Elementary School), who runs the teachers' edtech group [클래스똑딱](https://classddok.com). Issues: [https://github.com/ARTHONG1/ttokttak-workspace/issues](https://github.com/ARTHONG1/ttokttak-workspace/issues).
