import type { zh } from './zh'

export const es = {
  driveNav: 'Google Drive',
  driveDesc:
    'Abre y edita tus archivos de Drive en GenOffice; al guardar vuelven a Drive. También puedes dejar que la IA busque y lea archivos de tu Drive.',
  driveConnect: 'Conectar Google Drive',
  driveConnecting: 'Inicia sesión con tu cuenta de Google en el navegador y permite el acceso…',
  driveCancel: 'Cancelar',
  driveConnectedAs: 'Conectado como {email}',
  driveDisconnect: 'Desconectar',
  driveDisconnectConfirm:
    'Esto quita el inicio de sesión de Drive de este PC y pide a Google que retire el acceso de GenOffice. Las copias que ya están en este PC se conservan.',
  driveDisconnectYes: 'Desconectar',
  driveNotPersisted:
    'Este PC no puede guardar el inicio de sesión cifrado, así que la conexión termina al cerrar la aplicación.',
  driveExpired:
    'Google terminó la conexión: se retiró el acceso o la sesión caducó. Vuelve a conectar.',
  driveAiAccess: 'Dejar que la IA busque y lea archivos en Drive',
  driveAiAccessDesc:
    'Si está activado, la IA de los editores puede buscar en todo tu Drive y leer el texto de los archivos. Lo que lee va al proveedor de IA que usas. La IA no puede modificar, eliminar ni compartir archivos de Drive.',
  drivePrivacy:
    'Las listas y el contenido de los archivos viajan solo entre este PC y Google. Nunca pasan por un servidor de los creadores de GenOffice.',
  driveFailDenied: 'No se conectó porque Google no lo permitió.',
  driveFailScope:
    'No se conectó porque no se marcó el acceso a Drive. Vuelve a conectar y marca la opción de Drive.',
  driveFailTimeout: 'El inicio de sesión no terminó en 10 minutos. Inténtalo de nuevo.',
  driveFailNetwork:
    'No se pudo contactar con Google. Revisa tu conexión a internet e inténtalo de nuevo.',
  driveMyDrive: 'Mi unidad',
  driveShared: 'Compartido conmigo',
  driveRecent: 'Recientes',
  driveSearchPlaceholder: 'Buscar en Drive',
  driveSearchResults: 'Resultados de «{q}»',
  driveRefresh: 'Actualizar',
  driveNotConnectedTitle: 'Google Drive no está conectado',
  driveNotConnectedBody:
    'Una vez conectado, puedes abrir y editar aquí tus archivos de Drive, y al guardar vuelven a Drive.',
  driveOpenSettings: 'Conectar en Configuración',
  driveEmpty: 'No hay archivos.',
  driveLoading: 'Cargando…',
  driveLoadMore: 'Mostrar más',
  driveOpening: 'Abriendo…',
  driveGoogleBadge: 'Formato de Google',
  driveGoogleNote:
    'Un documento de Google se abre como archivo de Office. Al guardar, el original queda igual y se guarda un archivo de Office en la misma carpeta.',
  driveReadOnly: 'Solo lectura',
  driveReadOnlyNote:
    'No puedes editar este archivo. Al guardar, se te preguntará si quieres guardar una copia en Drive.',
  driveUnsupported: 'Esta aplicación no puede abrir este tipo de archivo.',
  driveErrNotConnected: 'Google Drive está desconectado. Vuelve a conectarlo en Configuración.',
  driveErrNotFound: 'No se encontró el archivo. Se eliminó o esta cuenta no puede verlo.',
  driveErrForbidden: 'Esta cuenta no tiene permiso para descargar este archivo.',
  driveErrTooLarge: 'El archivo es demasiado grande para abrirlo.',
  driveErrRateLimit: 'Google está frenando las solicitudes por un momento. Inténtalo en breve.',
  driveErrNetwork: 'No se pudo contactar con Google Drive. Revisa tu conexión a internet.',
  driveErrDisk: 'No se pudo guardar el archivo en este PC.',
  drivePickTitle: 'Adjuntar desde Drive',
  drivePickAttach: 'Adjuntar',
  drivePickSelected: '{n} seleccionados',
  drivePickWorking: 'Obteniendo archivos de Drive…',
  drivePickFolderNote: 'Marcar una carpeta adjunta hasta 20 archivos de ella.',
  drivePickGoogleNote: 'Un documento de Google se adjunta como archivo de Office.',
} satisfies Record<keyof typeof zh, string>
