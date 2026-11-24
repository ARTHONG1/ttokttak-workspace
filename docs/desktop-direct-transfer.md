# Desktop school-work transfer

The desktop NEIS record and K-Edufine proposal buttons invoke a local Playwright
driver through `home:direct-transfer`. AI only prepares the draft. The transfer
driver validates the package, operates the selected work form, and reads the
result back. It does not call an AI provider, install an extension, save a record,
submit an approval, or send undocumented HTTP requests.

## Use

1. Recommended: in the Chrome (or Edge) where you are already logged in, open
   `chrome://inspect/#remote-debugging` (`edge://inspect/#remote-debugging`) once and
   allow remote debugging. The browser then writes `DevToolsActivePort` into its
   user folder, and the app connects to it (`teacher-browser.ts`): it fills the
   NEIS or K-Edufine tab you already opened, or opens a new tab, and leaves your
   other tabs alone. Closing the app only disconnects. While remote debugging is
   allowed, other programs on the PC can control that browser too; turn it off
   there when you no longer send. Without it the app opens its own browser as
   described below.
2. Install Chrome or Edge. For a first K-Edufine transfer, register the HTTPS
   address of your education office's work portal in the proposal screen.
   Press the transfer button once to open the dedicated browser.
3. In that window, navigate to the education office's work portal, sign in and
   complete certificate authentication yourself. Existing personal-browser
   sessions are not imported.
4. Open the intended NEIS entry grid and select the first student's row. For
   K-Edufine, select the budget row and item type on the proposal registration
   form. Keep one matching work screen open. The app looks for the screen
   across tabs and popups in its dedicated browser.
5. The pending request starts filling when the screen is ready. The desktop
   app shows its progress and offers cancellation. A pending request waits
   for screen readiness for up to ten minutes.
6. Review the filled form and save or submit it yourself before closing the app.
   The app owns and closes its dedicated browser when it exits.

The web edition sends through its browser extension. Optional desktop startup
URLs can be provided through `TTOKTTAK_NEIS_URL` and
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
  request. If you cancel during input, check the form for entries already made
  before retrying. Packages and login data stay in the local transfer path.

## School PC verification

1. Using test entries, start a transfer before logging in. Complete login and
   select the student or budget on the target screen. Confirm that the app
   fills and verifies the form after the single send.
2. Repeat for a NEIS subject record, behavior record, activity record, and a
   K-Edufine proposal. Check the actual student text or proposal fields and total.
3. Cancel a new request before selecting a row, then select the row. Confirm
   that the cancelled request leaves the form untouched.
4. Repeat a completed request and confirm that it adds no duplicate entries.
   If a transfer fails, copy its diagnostics from the desktop transfer controls
   and record the step where it failed.

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
