import type { zh } from './zh'

export const pl = {
  driveNav: 'Dysk Google',
  driveDesc:
    'Otwieraj i edytuj pliki z Dysku w GenOffice; po zapisaniu wracają na Dysk. Możesz też pozwolić AI wyszukiwać i czytać pliki na Twoim Dysku.',
  driveConnect: 'Połącz z Dyskiem Google',
  driveConnecting: 'Zaloguj się na konto Google w przeglądarce i zezwól na dostęp…',
  driveCancel: 'Anuluj',
  driveConnectedAs: 'Połączono jako {email}',
  driveDisconnect: 'Rozłącz',
  driveDisconnectConfirm:
    'Logowanie do Dysku zostanie usunięte z tego komputera, a Google otrzyma prośbę o cofnięcie dostępu GenOffice. Kopie na tym komputerze pozostaną.',
  driveDisconnectYes: 'Rozłącz',
  driveNotPersisted:
    'Ten komputer nie może przechowywać logowania w postaci zaszyfrowanej, więc połączenie kończy się po zamknięciu aplikacji.',
  driveExpired:
    'Google zakończył połączenie: dostęp został cofnięty lub logowanie wygasło. Połącz ponownie.',
  driveAiAccess: 'Pozwól AI wyszukiwać i czytać pliki na Dysku',
  driveAiAccessDesc:
    'Po włączeniu AI w edytorach może przeszukiwać cały Dysk i czytać tekst plików. To, co przeczyta, trafia do używanego dostawcy AI. AI nie może zmieniać, usuwać ani udostępniać plików na Dysku.',
  drivePrivacy:
    'Listy i zawartość plików przesyłane są tylko między tym komputerem a Google. Nigdy nie przechodzą przez serwer twórców GenOffice.',
  driveFailDenied: 'Nie połączono, ponieważ Google na to nie zezwolił.',
  driveFailScope:
    'Nie połączono, ponieważ dostęp do Dysku nie został zaznaczony. Połącz ponownie i zaznacz pozycję Dysku.',
  driveFailTimeout: 'Logowanie nie zakończyło się w ciągu 10 minut. Spróbuj ponownie.',
  driveFailNetwork:
    'Nie można połączyć się z Google. Sprawdź połączenie z internetem i spróbuj ponownie.',
  driveMyDrive: 'Mój dysk',
  driveShared: 'Udostępnione dla mnie',
  driveRecent: 'Ostatnie',
  driveSearchPlaceholder: 'Szukaj na Dysku',
  driveSearchResults: 'Wyniki dla „{q}”',
  driveRefresh: 'Odśwież',
  driveNotConnectedTitle: 'Dysk Google nie jest połączony',
  driveNotConnectedBody:
    'Po połączeniu możesz tu otwierać i edytować pliki z Dysku, a po zapisaniu wracają na Dysk.',
  driveOpenSettings: 'Połącz w Ustawieniach',
  driveEmpty: 'Brak plików.',
  driveLoading: 'Wczytywanie…',
  driveLoadMore: 'Pokaż więcej',
  driveOpening: 'Otwieranie…',
  driveGoogleBadge: 'Format Google',
  driveGoogleNote:
    'Dokument Google otwiera się jako plik Office. Po zapisaniu oryginał pozostaje bez zmian, a w tym samym folderze zapisywany jest plik Office.',
  driveReadOnly: 'Tylko do odczytu',
  driveReadOnlyNote:
    'Nie możesz edytować tego pliku. Przy zapisie pojawi się pytanie, czy zapisać kopię na Dysku.',
  driveUnsupported: 'Ta aplikacja nie może otworzyć tego rodzaju pliku.',
  driveErrNotConnected: 'Dysk Google został rozłączony. Połącz go ponownie w Ustawieniach.',
  driveErrNotFound: 'Nie znaleziono pliku. Został usunięty albo to konto go nie widzi.',
  driveErrForbidden: 'To konto nie może pobrać tego pliku.',
  driveErrTooLarge: 'Plik jest za duży, aby go otworzyć.',
  driveErrRateLimit: 'Google chwilowo wstrzymuje żądania. Spróbuj za moment.',
  driveErrNetwork: 'Nie można połączyć się z Dyskiem Google. Sprawdź połączenie z internetem.',
  driveErrDisk: 'Nie udało się zapisać pliku na tym komputerze.',
  drivePickTitle: 'Załącz z Dysku',
  drivePickAttach: 'Załącz',
  drivePickSelected: 'Zaznaczono: {n}',
  drivePickWorking: 'Pobieranie plików z Dysku…',
  drivePickFolderNote: 'Zaznaczenie folderu załącza do 20 plików z niego.',
  drivePickGoogleNote: 'Dokument Google jest załączany jako plik Office.',
} satisfies Record<keyof typeof zh, string>
