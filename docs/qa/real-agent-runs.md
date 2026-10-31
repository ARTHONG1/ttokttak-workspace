# Real subscription AI and external application matrix

On 2026-10-28 no unattended request was sent to a paid or logged-in Codex/Claude provider. **Provider status: NOT RUN for each of DOCX, HWP, HWPX, XLSX, PPTX and PDF.** The existing `e2e/agent-mode-real.spec.ts` exposes the `IEUM_AGENT_REAL=codex|claude|both` opt-in but was not activated. Internal MCP E2E tests exercise the app's tool paths and should not be relabeled as natural-language model success.

No newly saved file was reopened and edited in a full Microsoft Word, Excel, PowerPoint, Hancom Hangul 2024 or LibreOffice application. **Cross-app status: NOT RUN for all six.** Historical reports of six HWPX incompatibilities remain risks until the original files and saved outputs are available for verified retesting. HWP Viewer installation alone does not establish round-trip save fidelity.

When real-provider checks are authorized, use **synthetic temporary fixtures**, document each request/response, the exact tool calls, before/after SHA-256, provider, token/cost impact, undo behavior and independent saved-file reopen. Do not reuse private school or personal documents as test inputs.
