<div align="center">

<img src="apps/shell/build/brand/app-icon.svg" width="88" alt="ttokttak-workspace icon" />

# ttokttak-workspace (똑딱작업실)

**An open-source AI workspace that takes the busywork out of documents**

Open a Hangul (HWP/HWPX), Word, Excel, PowerPoint or PDF file, say what to change, and the AI edits the document itself.<br />
Try it in the browser, or install it and connect your own AI agent.

[Web trial](https://hangul-ai-workbench-545101783843.asia-northeast3.run.app) · [Install with an AI agent](#install-with-an-ai-agent) · [한국어](README.md)

</div>

<p align="center"><a href="docs/assets/intro.mp4"><img src="docs/assets/intro-preview.gif" width="720" alt="ttokttak-workspace intro film preview" /></a></p>

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
- School work tools: a purchase request generator, a quiz maker (Blooket CSV, QuizN XLSX, PDF, video) and a word-search worksheet maker.
- A command line and MCP server (`ieumoffice`, `ieumoffice mcp`) for Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode and Windsurf.
- The app runs the Claude Code or Codex program you signed in to; it never reads or stores those logins.

## Privacy

The desktop app has no server of its own and sends no usage statistics; documents stay on your PC, and AI requests go to Anthropic or OpenAI under your own account. The web trial requires a Google sign-in, counts AI requests per account per day, keeps uploaded documents only in a temporary folder while you work (deleted 15 minutes after you leave) and sends AI requests to Google Vertex AI. See [PRIVACY.md](PRIVACY.md).

## Built on open source, published as open source

ttokttak-workspace is a modified version of [IeumOffice](https://github.com/pblsketch/openoffice) 0.12.5 (commit `4e4e9cc`), which is based on [GenOffice](https://github.com/genspark-ai/genoffice); both are Apache-2.0. It also builds on [rhwp](https://github.com/edwardkim/rhwp) (MIT) for Hangul documents, [Univer](https://github.com/dream-num/univer) (Apache-2.0) for spreadsheets, [Tiptap](https://github.com/ueberdosis/tiptap) (MIT) for Word and Markdown, and [PDF.js](https://github.com/mozilla/pdf.js) and [EmbedPDF](https://github.com/embedpdf/embed-pdf-viewer) (Apache-2.0, MIT) for PDF. The copyright notices and licences of all 575 bundled components ship unchanged.

What this project adds: HWPX saves that Hancom Hangul opens and that are validated before they overwrite a file, tables that split between pages, the browser trial edition (`web/`) with Google sign-in and per-account limits, the school work tools ported from the maker's 클래스똑딱 web tools, the agent-driven installer, and a Korean home screen and labels. The summary of changes is in [NOTICE](NOTICE); every change is in the history.

## Build from source

```bash
git clone https://github.com/ARTHONG1/ttokttak-workspace.git
cd ttokttak-workspace
npm install
npm run dev
```

Node 22.12+ (npm 10+) and Rust (`cargo` on the PATH) are required. See [CONTRIBUTING.md](CONTRIBUTING.md) for the checks a change must pass, and [llms.txt](llms.txt) for a map of the repository written for AI tools.

## License and acknowledgement

Licensed under the [Apache License 2.0](LICENSE); attribution and the summary of changes are in [NOTICE](NOTICE). ttokttak-workspace is an independent project and is not affiliated with, sponsored or endorsed by the IeumOffice maintainers, Genspark / Mainfunc, Inc., Anthropic, OpenAI, Microsoft, Hancom, Adobe, XMind or Google. "IeumOffice", "이음오피스", "GenOffice" and "Genspark" belong to their owners, and the licence grants no trademark rights (section 6). "한글", "한컴", "HWP" and "HWPX" are registered trademarks of Hancom Inc.; other product names belong to their owners and are used only to say what this program opens and works with.

> 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.

Made by 홍찬우 (Incheon Bongsu Elementary School), who runs the teachers' edtech group [클래스똑딱](https://classddok.com). Issues: [https://github.com/ARTHONG1/ttokttak-workspace/issues](https://github.com/ARTHONG1/ttokttak-workspace/issues).
