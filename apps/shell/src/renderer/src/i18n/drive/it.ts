import type { zh } from './zh'

export const it = {
  driveNav: 'Google Drive',
  driveDesc:
    'Apri e modifica i file di Drive in GenOffice; salvando tornano su Drive. Puoi anche lasciare che l’IA trovi e legga i file nel tuo Drive.',
  driveConnect: 'Collega Google Drive',
  driveConnecting: 'Accedi con il tuo account Google nel browser e consenti l’accesso…',
  driveCancel: 'Annulla',
  driveConnectedAs: 'Collegato come {email}',
  driveDisconnect: 'Scollega',
  driveDisconnectConfirm:
    'L’accesso a Drive verrà rimosso da questo PC e Google riceverà la richiesta di revocare l’accesso di GenOffice. Le copie già su questo PC restano.',
  driveDisconnectYes: 'Scollega',
  driveNotPersisted:
    'Questo PC non può conservare l’accesso in forma cifrata, quindi il collegamento termina alla chiusura dell’app.',
  driveExpired:
    'Google ha chiuso il collegamento: l’accesso è stato revocato o è scaduto. Collegati di nuovo.',
  driveAiAccess: 'Consenti all’IA di trovare e leggere i file in Drive',
  driveAiAccessDesc:
    'Se attivo, l’IA degli editor può cercare in tutto il tuo Drive e leggere il testo dei file. Ciò che legge va al fornitore di IA che usi. L’IA non può modificare, eliminare né condividere i file di Drive.',
  drivePrivacy:
    'Elenchi e contenuti dei file passano solo tra questo PC e Google. Non transitano mai da un server degli autori di GenOffice.',
  driveFailDenied: 'Il collegamento non è riuscito perché Google non lo ha consentito.',
  driveFailScope:
    'Il collegamento non è riuscito perché l’accesso a Drive non era selezionato. Collegati di nuovo e seleziona la voce Drive.',
  driveFailTimeout: 'L’accesso non è stato completato entro 10 minuti. Riprova.',
  driveFailNetwork:
    'Impossibile raggiungere Google. Controlla la connessione a internet e riprova.',
  driveMyDrive: 'Il mio Drive',
  driveShared: 'Condivisi con me',
  driveRecent: 'Recenti',
  driveSearchPlaceholder: 'Cerca in Drive',
  driveSearchResults: 'Risultati per “{q}”',
  driveRefresh: 'Aggiorna',
  driveNotConnectedTitle: 'Google Drive non è collegato',
  driveNotConnectedBody:
    'Una volta collegato, puoi aprire e modificare qui i file di Drive, e salvando tornano su Drive.',
  driveOpenSettings: 'Collega nelle Impostazioni',
  driveEmpty: 'Nessun file.',
  driveLoading: 'Caricamento…',
  driveLoadMore: 'Mostra altro',
  driveOpening: 'Apertura…',
  driveGoogleBadge: 'Formato Google',
  driveGoogleNote:
    'Un documento Google si apre come file Office. Salvando, l’originale resta com’è e un file Office viene salvato nella stessa cartella.',
  driveReadOnly: 'Sola lettura',
  driveReadOnlyNote:
    'Non puoi modificare questo file. Al salvataggio ti verrà chiesto se salvare una copia su Drive.',
  driveUnsupported: 'Questa app non può aprire questo tipo di file.',
  driveErrNotConnected: 'Google Drive è scollegato. Collegalo di nuovo nelle Impostazioni.',
  driveErrNotFound: 'File non trovato. È stato eliminato, oppure questo account non può vederlo.',
  driveErrForbidden: 'Questo account non può scaricare questo file.',
  driveErrTooLarge: 'Il file è troppo grande per essere aperto.',
  driveErrRateLimit: 'Google sta trattenendo le richieste per un momento. Riprova tra poco.',
  driveErrNetwork: 'Impossibile raggiungere Google Drive. Controlla la connessione a internet.',
  driveErrDisk: 'Impossibile salvare il file su questo PC.',
  drivePickTitle: 'Allega da Drive',
  drivePickAttach: 'Allega',
  drivePickSelected: '{n} selezionati',
  drivePickWorking: 'Recupero dei file da Drive…',
  drivePickFolderNote: 'Selezionare una cartella allega fino a 20 file al suo interno.',
  drivePickGoogleNote: 'Un documento Google viene allegato come file Office.',
} satisfies Record<keyof typeof zh, string>
