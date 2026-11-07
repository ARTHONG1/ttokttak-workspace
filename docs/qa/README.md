# Six-format desktop AI editing quality gate

This folder applies to the **Electron app in `program/`**, not the separate root webapp. Original fixtures are read only. All editing E2Es use temporary files and isolated application settings.

Run the fixture hash guard, independent structure tests and the five-app + Electron baseline:

```sh
cd program
node --test tools/qa/*.test.mjs
bash tools/qa/run-baseline.sh
node tools/qa/release-gate.mjs
```

The manifest is `tools/qa/fixtures-manifest.json`. Five versioned sample originals have pinned SHA-256 hashes; the PDF sample is generated at runtime in a temporary folder and hashed on creation. Missing files or altered pinned bytes fail before any edit. `check-fixtures.mjs` performs an independent **read-only** self-check of all six samples; this is a parser smoke test, not proof of saved-edit fidelity.

`compare-text-containers.mjs` detects missing DOCX/HWPX ZIP members, selected layout/annotation/revision object losses, and protected-part changes. For HWP it reports `LIMITED` because only the CFB signature is checked. `compare-media-containers.mjs` detects lost XLSX formulas and styles, PPTX slides/masters/media, and PDF pages, per-field widgets and per-page annotation counts. Both comparators accept explicit `allowedChanges` so intentional deletions can be distinguished from silent loss. A clean structural comparison is only one release requirement: visual pagination, encryption, macros, complex relationships, accessibility, and independent vendor reopen remain outside these checks.

The baseline runner writes a timestamped Markdown report plus six separate log files. `QA_SKIP_E2E=1` records E2E as `NOT RUN`; it never reports it as passed. `QA_OUTPUT_DIR` changes the report destination. The release gate uses `tools/qa/release-evidence.json` and blocks global write enablement wherever an essential case is `BLOCK`, `LIMITED` or `NOT RUN`.

HWPX saves now validate ZIP CRC, XML syntax, required package members, **byte-identical original master-page XML**, and presence of opened HWPX sections and embedded assets **before** backup or replacement. The editor has been observed renumbering master-page paragraph IDs during an ordinary body edit; until independently verified, a document with rewritten master-page XML must fail closed. A failure to verify existing memos aborts saving, including autosave. The baseline includes Electron HWP/HWPX memo edits, saves and reopens; these are engine-level tests and do not establish successful opening in Hancom 2024.

**Privacy:** Real Codex or Claude requests are disabled by default. `TTOK_AGENT_REAL` belongs to separate opt-in tests and may send document content to a model provider. No real customer document is included in the six-case corpus. Do not describe this release gate as certified Hancom or Office compatibility.
