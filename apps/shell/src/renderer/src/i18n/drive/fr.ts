import type { zh } from './zh'

export const fr = {
  driveNav: 'Google Drive',
  driveDesc:
    'Ouvrez et modifiez vos fichiers Drive dans GenOffice ; l’enregistrement les renvoie dans Drive. Vous pouvez aussi laisser l’IA trouver et lire des fichiers de votre Drive.',
  driveConnect: 'Connecter Google Drive',
  driveConnecting: 'Connectez-vous à votre compte Google dans le navigateur et autorisez l’accès…',
  driveCancel: 'Annuler',
  driveConnectedAs: 'Connecté en tant que {email}',
  driveDisconnect: 'Déconnecter',
  driveDisconnectConfirm:
    'Cela supprime la connexion Drive de ce PC et demande à Google de retirer l’accès de GenOffice. Les copies déjà présentes sur ce PC restent.',
  driveDisconnectYes: 'Déconnecter',
  driveNotPersisted:
    'Ce PC ne peut pas conserver la connexion chiffrée : elle prend fin à la fermeture de l’application.',
  driveExpired:
    'Google a mis fin à la connexion : l’accès a été retiré ou la connexion a expiré. Connectez-vous à nouveau.',
  driveAiAccess: 'Laisser l’IA trouver et lire des fichiers dans Drive',
  driveAiAccessDesc:
    'Activé, l’IA des éditeurs peut chercher dans tout votre Drive et lire le texte des fichiers. Ce qu’elle lit est envoyé au fournisseur d’IA que vous utilisez. L’IA ne peut pas modifier, supprimer ni partager des fichiers Drive.',
  drivePrivacy:
    'Les listes et le contenu des fichiers circulent uniquement entre ce PC et Google. Ils ne passent jamais par un serveur des auteurs de GenOffice.',
  driveFailDenied: 'La connexion n’a pas abouti car Google ne l’a pas autorisée.',
  driveFailScope:
    'La connexion n’a pas abouti car l’accès à Drive n’était pas coché. Reconnectez-vous et cochez l’élément Drive.',
  driveFailTimeout: 'La connexion ne s’est pas terminée en 10 minutes. Réessayez.',
  driveFailNetwork: 'Impossible de joindre Google. Vérifiez votre connexion Internet et réessayez.',
  driveMyDrive: 'Mon Drive',
  driveShared: 'Partagés avec moi',
  driveRecent: 'Récents',
  driveSearchPlaceholder: 'Rechercher dans Drive',
  driveSearchResults: 'Résultats pour « {q} »',
  driveRefresh: 'Actualiser',
  driveNotConnectedTitle: 'Google Drive n’est pas connecté',
  driveNotConnectedBody:
    'Une fois connecté, vous pouvez ouvrir et modifier ici vos fichiers Drive, et l’enregistrement les renvoie dans Drive.',
  driveOpenSettings: 'Connecter dans les paramètres',
  driveEmpty: 'Aucun fichier.',
  driveLoading: 'Chargement…',
  driveLoadMore: 'Afficher plus',
  driveOpening: 'Ouverture…',
  driveGoogleBadge: 'Format Google',
  driveGoogleNote:
    'Un document Google s’ouvre comme fichier Office. L’enregistrement laisse l’original intact et enregistre un fichier Office dans le même dossier.',
  driveReadOnly: 'Lecture seule',
  driveReadOnlyNote:
    'Vous ne pouvez pas modifier ce fichier. À l’enregistrement, on vous demandera s’il faut enregistrer une copie dans Drive.',
  driveUnsupported: 'Cette application ne peut pas ouvrir ce type de fichier.',
  driveErrNotConnected: 'Google Drive est déconnecté. Reconnectez-le dans les paramètres.',
  driveErrNotFound: 'Fichier introuvable. Il a été supprimé, ou ce compte ne peut pas le voir.',
  driveErrForbidden: 'Ce compte n’est pas autorisé à télécharger ce fichier.',
  driveErrTooLarge: 'Le fichier est trop volumineux pour être ouvert.',
  driveErrRateLimit: 'Google limite les requêtes pour un moment. Réessayez bientôt.',
  driveErrNetwork: 'Impossible de joindre Google Drive. Vérifiez votre connexion Internet.',
  driveErrDisk: 'Le fichier n’a pas pu être enregistré sur ce PC.',
  drivePickTitle: 'Joindre depuis Drive',
  drivePickAttach: 'Joindre',
  drivePickSelected: '{n} sélectionné(s)',
  drivePickWorking: 'Récupération depuis Drive…',
  drivePickFolderNote: 'Cocher un dossier joint jusqu’à 20 fichiers qu’il contient.',
  drivePickGoogleNote: 'Un document Google est joint comme fichier Office.',
} satisfies Record<keyof typeof zh, string>
