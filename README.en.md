# ttokttak-studio (똑딱작업실)

[한국어](README.md) · **English**

ttokttak-studio is a desktop office app that opens and edits Hangul (HWP/HWPX),
Word, Excel, PowerPoint, PDF, Markdown and HTML documents and mind maps in one
window. Each editor has an AI panel that edits the document itself through the
app's own editing tools, shows what changed and can undo it. The AI runs on the
**Claude Code or Codex program you installed and signed in to on your own PC**;
the app never reads or stores those logins.

The full documentation is in Korean: see [README.md](README.md).

## What ttokttak-studio adds

ttokttak-studio is built on open-source projects rather than written from
scratch: IeumOffice 0.12.5 and GenOffice (Apache-2.0) for the app itself, rhwp
(MIT) for Hangul documents, Univer (Apache-2.0) for spreadsheets, Tiptap (MIT)
for Word and Markdown, and PDF.js and EmbedPDF (Apache-2.0, MIT) for PDF. On
top of them it adds:

- HWPX saves that Hancom Hangul opens: the causes of its "damaged file"
  refusals fixed, checked by editing and saving 114 Hangul documents and
  opening each in the Hancom Office HWP Viewer
- saves that protect the original: HWP is saved as HWPX beside it, and the
  package, XML, memos and master pages are checked before anything is written
- tables longer than a page split between rows, with the title row repeated
- a browser trial edition (web/) that runs the unmodified desktop app per
  session, with each session confined to its own files
- school work tools ported from the maker's 클래스똑딱 web tools: a purchase
  request generator, a quiz maker and a word-search sheet maker
- a Korean home screen and Korean menus, settings and PDF labels

Made by 홍찬우 (Incheon Bongsu Elementary School), who runs the teachers'
edtech group [클래스똑딱](https://classddok.com).

## License and acknowledgement

ttokttak-studio is licensed under the [Apache License 2.0](LICENSE).

**It is a modified version of [IeumOffice](https://github.com/pblsketch/openoffice)
0.12.5 (commit `4e4e9cc`), which is based on
[GenOffice](https://github.com/genspark-ai/genoffice)**, the open-source office
suite by Genspark (Mainfunc, Inc.). Both are licensed under Apache-2.0. The
original copyright notices are kept, and [NOTICE](NOTICE) records the
attribution and what was changed.

The Hangul (HWP/HWPX) editor is built on
[rhwp](https://github.com/edwardkim/rhwp) (MIT License). As Hancom requires of
software made with its published HWP format document, we state:

> 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여
> 개발하였습니다.
>
> (This product was developed with reference to Hancom's published document
> on the Hangul document file format (.hwp).)

ttokttak-studio is an independent project. It is not affiliated with, sponsored
by or endorsed by the IeumOffice maintainers, Genspark / Mainfunc, Inc.,
Anthropic, OpenAI, Microsoft, Hancom, Adobe, XMind Ltd. or Google. "IeumOffice",
"GenOffice" and "Genspark", and their logos, belong to their owners; so do
"Claude", "Codex" and "ChatGPT". "Microsoft", "Windows", "Word", "Excel" and
"PowerPoint" are trademarks of Microsoft Corporation; "한글" (Hangul), "한컴"
(Hancom), "HWP" and "HWPX" are registered trademarks of Hancom Inc.; "XMind" is
a trademark of XMind Ltd.; and "Google Drive" is a trademark of Google LLC. They
are named here only to say what this software is based on, what it works with
and which files it opens.

The software is provided as is, without warranties of any kind, under sections 7
and 8 of the Apache License 2.0.

Questions, bug reports and trademark or copyright reports go to the
[GitHub issues](https://github.com/ARTHONG1/ttokttak-studio/issues).
