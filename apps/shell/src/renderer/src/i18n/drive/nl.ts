import type { zh } from './zh'

export const nl = {
  driveNav: 'Google Drive',
  driveDesc:
    'Open en bewerk je Drive-bestanden in GenOffice; bij opslaan gaan ze terug naar Drive. Je kunt de AI ook bestanden in je Drive laten zoeken en lezen.',
  driveConnect: 'Google Drive koppelen',
  driveConnecting: 'Log in de browser in met je Google-account en geef toegang…',
  driveCancel: 'Annuleren',
  driveConnectedAs: 'Gekoppeld als {email}',
  driveDisconnect: 'Ontkoppelen',
  driveDisconnectConfirm:
    'Hiermee wordt de Drive-aanmelding van deze pc verwijderd en wordt Google gevraagd de toegang van GenOffice in te trekken. Kopieën op deze pc blijven bewaard.',
  driveDisconnectYes: 'Ontkoppelen',
  driveNotPersisted:
    'Deze pc kan de aanmelding niet versleuteld bewaren, dus de koppeling stopt als je de app sluit.',
  driveExpired:
    'Google heeft de koppeling beëindigd: de toegang is ingetrokken of de aanmelding is verlopen. Koppel opnieuw.',
  driveAiAccess: 'De AI bestanden in Drive laten zoeken en lezen',
  driveAiAccessDesc:
    'Als dit aan staat, kan de AI in de editors je hele Drive doorzoeken en de tekst van bestanden lezen. Wat de AI leest, gaat naar de AI-aanbieder die je gebruikt. De AI kan Drive-bestanden niet wijzigen, verwijderen of delen.',
  drivePrivacy:
    'Bestandslijsten en -inhoud gaan alleen tussen deze pc en Google. Ze gaan nooit via een server van de makers van GenOffice.',
  driveFailDenied: 'Koppelen is mislukt omdat Google het niet toestond.',
  driveFailScope:
    'Koppelen is mislukt omdat toegang tot Drive niet was aangevinkt. Koppel opnieuw en vink het Drive-item aan.',
  driveFailTimeout: 'De aanmelding is niet binnen 10 minuten voltooid. Probeer het opnieuw.',
  driveFailNetwork:
    'Google is niet bereikbaar. Controleer je internetverbinding en probeer het opnieuw.',
  driveMyDrive: 'Mijn Drive',
  driveShared: 'Gedeeld met mij',
  driveRecent: 'Recent',
  driveSearchPlaceholder: 'Zoeken in Drive',
  driveSearchResults: 'Resultaten voor “{q}”',
  driveRefresh: 'Vernieuwen',
  driveNotConnectedTitle: 'Google Drive is niet gekoppeld',
  driveNotConnectedBody:
    'Na het koppelen kun je Drive-bestanden hier openen en bewerken, en bij opslaan gaan ze terug naar Drive.',
  driveOpenSettings: 'Koppelen in Instellingen',
  driveEmpty: 'Geen bestanden.',
  driveLoading: 'Laden…',
  driveLoadMore: 'Meer tonen',
  driveOpening: 'Openen…',
  driveGoogleBadge: 'Google-indeling',
  driveGoogleNote:
    'Een Google-document opent als Office-bestand. Bij opslaan blijft het origineel ongewijzigd en wordt een Office-bestand in dezelfde map opgeslagen.',
  driveReadOnly: 'Alleen bekijken',
  driveReadOnlyNote:
    'Je mag dit bestand niet bewerken. Bij opslaan wordt gevraagd of je een kopie in Drive wilt opslaan.',
  driveUnsupported: 'Deze app kan dit soort bestand niet openen.',
  driveErrNotConnected: 'Google Drive is ontkoppeld. Koppel het opnieuw in Instellingen.',
  driveErrNotFound: 'Bestand niet gevonden. Het is verwijderd, of dit account kan het niet zien.',
  driveErrForbidden: 'Dit account mag dit bestand niet downloaden.',
  driveErrTooLarge: 'Het bestand is te groot om te openen.',
  driveErrRateLimit: 'Google houdt verzoeken even tegen. Probeer het zo opnieuw.',
  driveErrNetwork: 'Google Drive is niet bereikbaar. Controleer je internetverbinding.',
  driveErrDisk: 'Het bestand kon niet op deze pc worden opgeslagen.',
  drivePickTitle: 'Bijvoegen uit Drive',
  drivePickAttach: 'Bijvoegen',
  drivePickSelected: '{n} geselecteerd',
  drivePickWorking: 'Bestanden ophalen uit Drive…',
  drivePickFolderNote: 'Een aangevinkte map voegt tot 20 bestanden eruit bij.',
  drivePickGoogleNote: 'Een Google-document wordt als Office-bestand bijgevoegd.',
} satisfies Record<keyof typeof zh, string>
