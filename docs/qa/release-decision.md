# Desktop six-format release decision

**Generated:** 2026-10-28T14:11:03.851Z

**Write enablement across all six formats:** BLOCKED

| Format | Safe to enable all writes | Missing evidence / active blocker |
| --- | --- | --- |
| DOCX | NO | docx-external-office |
| HWP | NO | hwp-master-compatibility |
| HWPX | NO | hwpx-hancom-six |
| XLSX | NO | xlsx-excel-reopen |
| PPTX | NO | pptx-powerpoint-reopen |
| PDF | NO | pdf-independent-viewer |
| AI | NO | all-formats-real-subscriptions |

| Case | Status | Severity | Reason |
| --- | --- | --- | --- |
| docx-internal-edits | PASS | P2 | Vitest and Electron MCP document edits/save passed |
| docx-external-office | NOT RUN | P1 | No fresh Microsoft Word/LibreOffice edited-file reopen test |
| hwp-integrity-guard | PASS | P1 | New HWP master-page/memo loss blocker unit checks pass; other HWP save tests pass |
| hwp-read-only-open | PASS | P2 | Electron opens copied HWP fixture and leaves SHA-256 unchanged |
| hwp-master-compatibility | BLOCK | P0 | Affected HWP master-page documents require independent round-trip; destructive save path now aborts |
| hwpx-read-only-open | PASS | P2 | Electron opens copied HWPX fixture and leaves SHA-256 unchanged |
| hwpx-save-archive-guard | PASS | P1 | Pre-overwrite CRC, XML, required parts, exact original master-page preservation and section/asset presence tests pass; Electron rejects unsafe master-page rewrites and HWPX memo round-trip passes |
| hwpx-hancom-six | BLOCK | P0 | Six historic HWPX reopens failed in Hancom 2024; no fresh repair/verification corpus |
| xlsx-internal-save | PASS | P2 | Workbook native save, formula and overwrite-safety tests passed |
| xlsx-excel-reopen | NOT RUN | P1 | No Excel/LibreOffice edited-workbook reopen |
| pptx-internal-save | PASS | P2 | Deck native edit queue/atomic save and internal MCP tests passed |
| pptx-powerpoint-reopen | NOT RUN | P1 | No PowerPoint/LibreOffice edited-deck reopen |
| pdf-widget-persistence | PASS | P2 | Seven widgets from six fields verified on disk; form design E2E passes with save/reload barrier |
| pdf-independent-viewer | NOT RUN | P1 | No external PDF editor/viewer or subscription AI full round-trip |
| all-formats-real-subscriptions | NOT RUN | P1 | No opt-in IEUM_AGENT_REAL=codex|claude real provider calls; do not silently incur cost or transmit files |

A `PASS` for a unit test or internal E2E is not proof of full external application compatibility.
This report is a release policy decision. Product enforcement is implemented only for the HWP/HWPX integrity abort in `apps/hwp/src/main/hwp-main.ts`.
The actual Codex/Claude subscription and proprietary Office/Hancom editor workflows need separate evidence before any global write enablement.
