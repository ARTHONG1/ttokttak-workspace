# Desktop school-work transfer

The desktop NEIS record and K-Edufine proposal buttons invoke a local Playwright
driver through `home:direct-transfer`. AI only prepares the draft. The transfer
driver validates the package, operates the selected work form, and reads the
result back. It does not call an AI provider, install an extension, save a record,
submit an approval, or send undocumented HTTP requests.

## Use

1. Install Chrome or Edge. Press the desktop transfer button to open a dedicated
   browser profile under the application's user-data directory.
2. In that window, navigate to the education office's work portal, sign in and
   complete certificate authentication yourself. Existing personal-browser
   sessions are not imported.
3. Open the intended NEIS entry grid and select the first student's row, or open
   K-Edufine's proposal registration form and select the budget and item type.
4. Return to the desktop app and press the transfer button again. Keep just one
   matching work screen open. The driver also discovers work frames and popups
   in its own browser context.
5. Review the filled form and save or submit it yourself before closing the app.
   The app owns and closes its dedicated browser when it exits.

The web edition keeps its existing extension route. Desktop never falls back to
that route. Optional startup URLs can be provided through `TTOKTTAK_NEIS_URL` and
`TTOKTTAK_EDUFINE_URL`; once a teacher visits NEIS or K-Edufine in the dedicated
browser, only its HTTPS origin (without paths or query tokens) is remembered for
future launches. The driver writes only to HTTPS NEIS work hosts (excluding the
open-data host) and HTTPS `*.go.kr` frames that host a live Nexacro K-Edufine app.

## Failure behavior

- NEIS requires exact student names, distinct within the batch, and a single
  selected student row (including split fixed-column grids). It stops on multi-row
  selection, a different existing text, ambiguous grids, name mismatch, editor
  failure, or failed row movement. Empty entries preserve their place. Teachers can
  retry either from the first row (identical entries are verified and skipped) or
  directly from the student row where filling stopped.
- K-Edufine resolves the active frame and the grid's bound dataset, validates
  units and budget, opens the proposal registration menu automatically when on
  another K-Edufine screen, detects duplicate item sequences, and verifies every
  field and the total (tolerating CRLF normalization). On failure it restores newly
  added rows and changed headings; a failed restoration is explicitly reported.
- Concurrent requests are rejected. A closed browser is recreated on the next
  request. Packages and login data are not logged or sent to the web-app queue.

## Verification boundary

`tests/direct-transfer-browser.test.ts` exercises real Chromium against local
synthetic NEIS/Nexacro fixtures, with every page request intercepted. It checks
input, read-back, mismatches, skipped rows, existing data, rollback, duplicates,
concurrency and browser reopening. These tests do not establish compatibility
with a particular education office's live system. When no compatible browser is
installed the browser suite is explicitly skipped; the remaining unit tests run.

Live certificate/security middleware, office-specific screen revisions, Windows
native approval windows (`WXSClient`) and file attachments still require validation
on a live school PC. No server-side save or approval automation is implemented.

Playwright is a production dependency kept external to the Electron main bundle
and shipped in the packaged app's `node_modules`.
