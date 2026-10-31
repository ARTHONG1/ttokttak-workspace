import type { zh } from './zh'

export const ms = {
  driveNav: 'Google Drive',
  driveDesc:
    'Buka dan edit fail Drive anda dalam GenOffice; apabila disimpan, fail kembali ke Drive. Anda juga boleh membenarkan AI mencari dan membaca fail dalam Drive anda.',
  driveConnect: 'Sambungkan Google Drive',
  driveConnecting: 'Log masuk dengan akaun Google anda dalam pelayar dan benarkan akses…',
  driveCancel: 'Batal',
  driveConnectedAs: 'Disambungkan sebagai {email}',
  driveDisconnect: 'Putuskan sambungan',
  driveDisconnectConfirm:
    'Ini membuang log masuk Drive daripada PC ini dan meminta Google menarik balik akses GenOffice. Salinan yang sudah ada pada PC ini kekal.',
  driveDisconnectYes: 'Putuskan sambungan',
  driveNotPersisted:
    'PC ini tidak dapat menyimpan log masuk secara tersulit, jadi sambungan tamat apabila aplikasi ditutup.',
  driveExpired:
    'Google menamatkan sambungan: akses ditarik balik atau log masuk tamat tempoh. Sambung semula.',
  driveAiAccess: 'Benarkan AI mencari dan membaca fail dalam Drive',
  driveAiAccessDesc:
    'Apabila dihidupkan, AI dalam editor boleh mencari seluruh Drive anda dan membaca teks fail. Apa yang dibacanya dihantar kepada penyedia AI yang anda gunakan. AI tidak boleh mengubah, memadam atau berkongsi fail Drive.',
  drivePrivacy:
    'Senarai dan kandungan fail hanya bergerak antara PC ini dan Google. Ia tidak pernah melalui pelayan pembuat GenOffice.',
  driveFailDenied: 'Sambungan gagal kerana Google tidak membenarkannya.',
  driveFailScope:
    'Sambungan gagal kerana akses Drive tidak ditanda. Sambung semula dan tandakan item Drive.',
  driveFailTimeout: 'Log masuk tidak selesai dalam 10 minit. Cuba lagi.',
  driveFailNetwork: 'Google tidak dapat dihubungi. Semak sambungan internet anda dan cuba lagi.',
  driveMyDrive: 'Drive Saya',
  driveShared: 'Dikongsi dengan saya',
  driveRecent: 'Terbaharu',
  driveSearchPlaceholder: 'Cari dalam Drive',
  driveSearchResults: 'Hasil untuk “{q}”',
  driveRefresh: 'Muat semula',
  driveNotConnectedTitle: 'Google Drive belum disambungkan',
  driveNotConnectedBody:
    'Selepas disambungkan, anda boleh membuka dan mengedit fail Drive di sini, dan apabila disimpan fail kembali ke Drive.',
  driveOpenSettings: 'Sambungkan dalam Tetapan',
  driveEmpty: 'Tiada fail.',
  driveLoading: 'Memuatkan…',
  driveLoadMore: 'Tunjukkan lagi',
  driveOpening: 'Membuka…',
  driveGoogleBadge: 'Format Google',
  driveGoogleNote:
    'Dokumen Google dibuka sebagai fail Office. Apabila disimpan, yang asal kekal seperti biasa dan fail Office disimpan dalam folder yang sama.',
  driveReadOnly: 'Lihat sahaja',
  driveReadOnlyNote:
    'Anda tidak boleh mengedit fail ini. Apabila menyimpan, anda akan ditanya sama ada mahu menyimpan salinan ke Drive.',
  driveUnsupported: 'Aplikasi ini tidak dapat membuka jenis fail ini.',
  driveErrNotConnected: 'Google Drive telah diputuskan. Sambung semula dalam Tetapan.',
  driveErrNotFound: 'Fail tidak ditemui. Ia telah dipadam, atau akaun ini tidak dapat melihatnya.',
  driveErrForbidden: 'Akaun ini tidak dibenarkan memuat turun fail ini.',
  driveErrTooLarge: 'Fail terlalu besar untuk dibuka.',
  driveErrRateLimit: 'Google menahan permintaan seketika. Cuba lagi sebentar nanti.',
  driveErrNetwork: 'Google Drive tidak dapat dihubungi. Semak sambungan internet anda.',
  driveErrDisk: 'Fail tidak dapat disimpan pada PC ini.',
  drivePickTitle: 'Lampirkan daripada Drive',
  drivePickAttach: 'Lampirkan',
  drivePickSelected: '{n} dipilih',
  drivePickWorking: 'Mengambil fail daripada Drive…',
  drivePickFolderNote: 'Menanda folder melampirkan sehingga 20 fail di dalamnya.',
  drivePickGoogleNote: 'Dokumen Google dilampirkan sebagai fail Office.',
} satisfies Record<keyof typeof zh, string>
