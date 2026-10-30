#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="${QA_OUTPUT_DIR:-${ROOT}/docs/qa}"
mkdir -p "${REPORT_DIR}/logs"
STAMP="$(date '+%Y%m%d-%H%M%S')"
REPORT="${REPORT_DIR}/baseline-${STAMP}.md"
FAILED=0

{
  printf '# Six-format desktop QA baseline — %s\n\n' "$(date '+%F %T %z')"
  printf 'Git SHA: `%s`; OS: `%s`; Node: `%s`\n\n' "$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)" "$(uname -sm)" "$(node --version)"
  # the report is committed, so name the log folder relative to the repository, never this machine's path
  printf 'Each result is independent. Logs: `%s/logs`. A skipped real provider is not PASS.\n\n' "${REPORT_DIR#"$ROOT"/}"
  printf '| Suite | Command | Exit | Result |\n| --- | --- | ---: | --- |\n'
} > "$REPORT"

run_suite() {
  local label="$1"; local dir="$2"; shift 2
  local log="${REPORT_DIR}/logs/${STAMP}-${label}.log"
  local command="$*"
  local exit_code
  if [[ -n "${QA_TEST_RUNNER:-}" ]]; then
    (cd "$dir" && "$QA_TEST_RUNNER" "$label") > "$log" 2>&1
  else
    (cd "$dir" && "$@") > "$log" 2>&1
  fi
  exit_code=$?
  if [[ "$exit_code" -ne 0 ]]; then FAILED=1; fi
  printf '| %s | `%s` | %s | %s |\n' "$label" "$command" "$exit_code" "$([[ "$exit_code" -eq 0 ]] && echo PASS || echo FAIL)" >> "$REPORT"
  printf '%s: exit=%s log=%s\n' "$label" "$exit_code" "$log"
}

run_suite hwp "$ROOT/apps/hwp" npx vitest run tests/save-flow.test.ts tests/save-integrity.test.ts tests/hwpx-save-validation.test.ts tests/memos.test.ts tests/recovery-roundtrip.test.ts tests/agent-plugin.test.ts tests/agent-plugin-tables.test.ts tests/save-conflict.test.ts tests/agent-plugin-nested-budget.test.ts tests/agent-plugin-memos.test.ts tests/agent-plugin-notes.test.ts tests/agent-plugin-format.test.ts tests/agent-plugin-duplicate-fields.test.ts tests/agent-plugin-engine.test.ts
run_suite docx "$ROOT/apps/docs" npx vitest run tests/ai-run.test.ts tests/ai-edit-queue.test.ts tests/ai-rollback-snapshot.test.ts tests/docs-recovery.test.ts
run_suite xlsx "$ROOT/apps/sheets" npx vitest run tests/ai-run.test.ts tests/formula-values.test.ts tests/save-verify-before-overwrite.test.ts tests/save-conflict.test.ts
run_suite pptx "$ROOT/apps/slides" npx vitest run tests/edit-ops.test.ts tests/ai-edit-queue.test.ts tests/deck-save-atomic.test.ts tests/save-conflict.test.ts
run_suite pdf "$ROOT/apps/pdf" npx vitest run tests/ai-tools.test.ts tests/edit-ops.test.ts tests/save-pdf.test.ts tests/save-conflict.test.ts

if [[ "${QA_SKIP_E2E:-0}" == 1 ]]; then
  printf '| electron-e2e | not requested | — | NOT RUN |\n' >> "$REPORT"
else
  run_suite electron-e2e "$ROOT" npx playwright test -c e2e/playwright.config.ts e2e/mcp-visible-doc.spec.ts e2e/mcp-visible-sheet.spec.ts e2e/mcp-visible-deck.spec.ts e2e/mcp-read-pdf.spec.ts e2e/pdf-blank-page.spec.ts e2e/pdf-form-design.spec.ts e2e/qa-hwp-readonly.spec.ts e2e/hwp-memos.spec.ts --reporter=line
fi

{
  printf '\nReal Codex/Claude provider executions: **NOT RUN** unless separately authorized and logged.\n'
  printf '\nIndependent Hancom 2024/Word/Excel/PowerPoint reopen: **NOT RUN** by this script.\n'
} >> "$REPORT"

printf 'Report: %s\n' "$REPORT"
exit "$FAILED"
