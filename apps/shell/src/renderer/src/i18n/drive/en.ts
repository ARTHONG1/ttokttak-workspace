import type { zh } from './zh'

export const en = {
  driveNav: 'Google Drive',
  driveDesc:
    'Open and edit your Drive files in GenOffice; saving puts them back in Drive. You can also let the AI find and read files in your Drive.',
  driveConnect: 'Connect Google Drive',
  driveConnecting: 'Sign in with your Google account in the browser and allow access…',
  driveCancel: 'Cancel',
  driveConnectedAs: 'Connected as {email}',
  driveDisconnect: 'Disconnect',
  driveDisconnectConfirm:
    'This removes the Drive sign-in from this PC and asks Google to revoke GenOffice’s access. Copies already on this PC stay.',
  driveDisconnectYes: 'Disconnect',
  driveNotPersisted:
    'This PC can’t keep the sign-in encrypted, so the connection ends when you close the app.',
  driveExpired:
    'Google ended the connection: access was removed or the sign-in expired. Connect again.',
  driveAiAccess: 'Let the AI find and read files in Drive',
  driveAiAccessDesc:
    'When on, the AI in the editors can search your whole Drive and read file text. What it reads goes to the AI provider you use. The AI cannot change, delete or share Drive files.',
  drivePrivacy:
    'File lists and contents travel only between this PC and Google. They never pass through a server of GenOffice’s makers.',
  driveFailDenied: 'The connection was not made because Google did not allow it.',
  driveFailScope:
    'The connection was not made because Drive access was not ticked. Connect again and tick the Drive item.',
  driveFailTimeout: 'The sign-in did not finish within 10 minutes. Try again.',
  driveFailNetwork: 'Google could not be reached. Check your internet connection and try again.',
  driveMyDrive: 'My Drive',
  driveShared: 'Shared with me',
  driveRecent: 'Recent',
  driveSearchPlaceholder: 'Search in Drive',
  driveSearchResults: 'Results for “{q}”',
  driveRefresh: 'Refresh',
  driveNotConnectedTitle: 'Google Drive is not connected',
  driveNotConnectedBody:
    'Once connected, you can open and edit Drive files here, and saving puts them back in Drive.',
  driveOpenSettings: 'Connect in Settings',
  driveEmpty: 'No files.',
  driveLoading: 'Loading…',
  driveLoadMore: 'Show more',
  driveOpening: 'Opening…',
  driveGoogleBadge: 'Google format',
  driveGoogleNote:
    'A Google document opens as an Office file. Saving leaves the original as it is and saves an Office file in the same folder.',
  driveReadOnly: 'View only',
  driveReadOnlyNote:
    'You can’t edit this file. When you save, you’ll be asked whether to save a copy to Drive.',
  driveUnsupported: 'This app can’t open this kind of file.',
  driveErrNotConnected: 'Google Drive is disconnected. Connect again in Settings.',
  driveErrNotFound: 'The file was not found. It was deleted, or this account can’t see it.',
  driveErrForbidden: 'This account may not download this file.',
  driveErrTooLarge: 'The file is too large to open.',
  driveErrRateLimit: 'Google is holding back requests for a moment. Try again shortly.',
  driveErrNetwork: 'Google Drive could not be reached. Check your internet connection.',
  driveErrDisk: 'The file could not be saved on this PC.',
  drivePickTitle: 'Attach from Drive',
  drivePickAttach: 'Attach',
  drivePickSelected: '{n} selected',
  drivePickWorking: 'Getting files from Drive…',
  drivePickFolderNote: 'Ticking a folder attaches up to 20 files in it.',
  drivePickGoogleNote: 'A Google document is attached as an Office file.',
} satisfies Record<keyof typeof zh, string>
