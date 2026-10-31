import type { zh } from './zh'

export const cs = {
  driveNav: 'Disk Google',
  driveDesc:
    'Otevírejte a upravujte soubory z Disku v GenOffice; při uložení se vrátí na Disk. Můžete také nechat AI vyhledávat a číst soubory na vašem Disku.',
  driveConnect: 'Připojit Disk Google',
  driveConnecting: 'Přihlaste se v prohlížeči účtem Google a povolte přístup…',
  driveCancel: 'Zrušit',
  driveConnectedAs: 'Připojeno jako {email}',
  driveDisconnect: 'Odpojit',
  driveDisconnectConfirm:
    'Tím se z tohoto počítače odstraní přihlášení k Disku a Google dostane žádost o odebrání přístupu GenOffice. Kopie v tomto počítači zůstanou.',
  driveDisconnectYes: 'Odpojit',
  driveNotPersisted:
    'Tento počítač neumí uložit přihlášení zašifrované, takže připojení skončí po zavření aplikace.',
  driveExpired:
    'Google ukončil připojení: přístup byl odebrán nebo přihlášení vypršelo. Připojte se znovu.',
  driveAiAccess: 'Nechat AI vyhledávat a číst soubory na Disku',
  driveAiAccessDesc:
    'Když je zapnuto, AI v editorech může prohledávat celý Disk a číst text souborů. Co přečte, odchází poskytovateli AI, kterého používáte. AI nemůže soubory na Disku měnit, mazat ani sdílet.',
  drivePrivacy:
    'Seznamy a obsah souborů putují jen mezi tímto počítačem a Googlem. Nikdy neprocházejí serverem tvůrců GenOffice.',
  driveFailDenied: 'Připojení se nezdařilo, protože ho Google nepovolil.',
  driveFailScope:
    'Připojení se nezdařilo, protože přístup k Disku nebyl zaškrtnut. Připojte se znovu a zaškrtněte položku Disku.',
  driveFailTimeout: 'Přihlášení nebylo dokončeno do 10 minut. Zkuste to znovu.',
  driveFailNetwork: 'Google není dostupný. Zkontrolujte připojení k internetu a zkuste to znovu.',
  driveMyDrive: 'Můj disk',
  driveShared: 'Sdíleno se mnou',
  driveRecent: 'Nedávné',
  driveSearchPlaceholder: 'Hledat na Disku',
  driveSearchResults: 'Výsledky pro „{q}“',
  driveRefresh: 'Obnovit',
  driveNotConnectedTitle: 'Disk Google není připojen',
  driveNotConnectedBody:
    'Po připojení zde můžete otevírat a upravovat soubory z Disku a při uložení se vrátí na Disk.',
  driveOpenSettings: 'Připojit v Nastavení',
  driveEmpty: 'Žádné soubory.',
  driveLoading: 'Načítání…',
  driveLoadMore: 'Zobrazit další',
  driveOpening: 'Otevírání…',
  driveGoogleBadge: 'Formát Google',
  driveGoogleNote:
    'Dokument Google se otevře jako soubor Office. Při uložení zůstane originál beze změny a do stejné složky se uloží soubor Office.',
  driveReadOnly: 'Jen ke čtení',
  driveReadOnlyNote:
    'Tento soubor nemůžete upravovat. Při uložení se zobrazí dotaz, zda uložit kopii na Disk.',
  driveUnsupported: 'Tato aplikace takový soubor otevřít neumí.',
  driveErrNotConnected: 'Disk Google je odpojen. Připojte ho znovu v Nastavení.',
  driveErrNotFound: 'Soubor nebyl nalezen. Byl smazán, nebo ho tento účet nevidí.',
  driveErrForbidden: 'Tento účet nesmí stáhnout tento soubor.',
  driveErrTooLarge: 'Soubor je příliš velký na otevření.',
  driveErrRateLimit: 'Google na chvíli zdržuje požadavky. Zkuste to za chvíli.',
  driveErrNetwork: 'Disk Google není dostupný. Zkontrolujte připojení k internetu.',
  driveErrDisk: 'Soubor se nepodařilo uložit do tohoto počítače.',
  drivePickTitle: 'Připojit z Disku',
  drivePickAttach: 'Připojit',
  drivePickSelected: 'Vybráno: {n}',
  drivePickWorking: 'Načítání souborů z Disku…',
  drivePickFolderNote: 'Zaškrtnutí složky připojí až 20 souborů z ní.',
  drivePickGoogleNote: 'Dokument Google se připojí jako soubor Office.',
} satisfies Record<keyof typeof zh, string>
