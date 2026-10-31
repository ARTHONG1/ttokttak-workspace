import type { zh } from './zh'

export const de = {
  driveNav: 'Google Drive',
  driveDesc:
    'Öffnen und bearbeiten Sie Ihre Drive-Dateien in GenOffice; beim Speichern gehen sie zurück in Drive. Sie können die KI auch Dateien in Ihrem Drive suchen und lesen lassen.',
  driveConnect: 'Google Drive verbinden',
  driveConnecting:
    'Melden Sie sich im Browser mit Ihrem Google-Konto an und erlauben Sie den Zugriff…',
  driveCancel: 'Abbrechen',
  driveConnectedAs: 'Verbunden als {email}',
  driveDisconnect: 'Trennen',
  driveDisconnectConfirm:
    'Damit wird die Drive-Anmeldung von diesem PC entfernt und Google gebeten, den Zugriff von GenOffice zu widerrufen. Kopien auf diesem PC bleiben erhalten.',
  driveDisconnectYes: 'Trennen',
  driveNotPersisted:
    'Dieser PC kann die Anmeldung nicht verschlüsselt speichern, daher endet die Verbindung beim Schließen der App.',
  driveExpired:
    'Google hat die Verbindung beendet: Der Zugriff wurde entzogen oder die Anmeldung ist abgelaufen. Verbinden Sie erneut.',
  driveAiAccess: 'KI darf Dateien in Drive suchen und lesen',
  driveAiAccessDesc:
    'Wenn aktiviert, kann die KI in den Editoren Ihr gesamtes Drive durchsuchen und den Text von Dateien lesen. Was sie liest, geht an den KI-Anbieter, den Sie nutzen. Die KI kann Drive-Dateien nicht ändern, löschen oder freigeben.',
  drivePrivacy:
    'Dateilisten und -inhalte werden nur zwischen diesem PC und Google übertragen. Sie laufen nie über einen Server der Macher von GenOffice.',
  driveFailDenied: 'Die Verbindung kam nicht zustande, weil Google sie nicht erlaubt hat.',
  driveFailScope:
    'Die Verbindung kam nicht zustande, weil der Drive-Zugriff nicht angehakt war. Verbinden Sie erneut und haken Sie Drive an.',
  driveFailTimeout:
    'Die Anmeldung wurde nicht innerhalb von 10 Minuten abgeschlossen. Versuchen Sie es erneut.',
  driveFailNetwork:
    'Google ist nicht erreichbar. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
  driveMyDrive: 'Meine Ablage',
  driveShared: 'Für mich freigegeben',
  driveRecent: 'Zuletzt verwendet',
  driveSearchPlaceholder: 'In Drive suchen',
  driveSearchResults: 'Ergebnisse für „{q}“',
  driveRefresh: 'Aktualisieren',
  driveNotConnectedTitle: 'Google Drive ist nicht verbunden',
  driveNotConnectedBody:
    'Nach dem Verbinden können Sie Drive-Dateien hier öffnen und bearbeiten; beim Speichern gehen sie zurück in Drive.',
  driveOpenSettings: 'In den Einstellungen verbinden',
  driveEmpty: 'Keine Dateien.',
  driveLoading: 'Wird geladen…',
  driveLoadMore: 'Mehr anzeigen',
  driveOpening: 'Wird geöffnet…',
  driveGoogleBadge: 'Google-Format',
  driveGoogleNote:
    'Ein Google-Dokument wird als Office-Datei geöffnet. Beim Speichern bleibt das Original unverändert, und im selben Ordner wird eine Office-Datei gespeichert.',
  driveReadOnly: 'Nur ansehen',
  driveReadOnlyNote:
    'Sie dürfen diese Datei nicht bearbeiten. Beim Speichern werden Sie gefragt, ob eine Kopie in Drive gespeichert werden soll.',
  driveUnsupported: 'Diese App kann diese Art von Datei nicht öffnen.',
  driveErrNotConnected: 'Google Drive ist getrennt. Verbinden Sie es in den Einstellungen erneut.',
  driveErrNotFound:
    'Datei nicht gefunden. Sie wurde gelöscht, oder dieses Konto kann sie nicht sehen.',
  driveErrForbidden: 'Dieses Konto darf diese Datei nicht herunterladen.',
  driveErrTooLarge: 'Die Datei ist zu groß zum Öffnen.',
  driveErrRateLimit: 'Google hält Anfragen kurz zurück. Versuchen Sie es gleich noch einmal.',
  driveErrNetwork: 'Google Drive ist nicht erreichbar. Prüfen Sie Ihre Internetverbindung.',
  driveErrDisk: 'Die Datei konnte nicht auf diesem PC gespeichert werden.',
  drivePickTitle: 'Aus Drive anhängen',
  drivePickAttach: 'Anhängen',
  drivePickSelected: '{n} ausgewählt',
  drivePickWorking: 'Dateien werden aus Drive geholt…',
  drivePickFolderNote: 'Ein angehakter Ordner hängt bis zu 20 Dateien daraus an.',
  drivePickGoogleNote: 'Ein Google-Dokument wird als Office-Datei angehängt.',
} satisfies Record<keyof typeof zh, string>
