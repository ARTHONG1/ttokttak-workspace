import type { zh } from './zh'

export const id = {
  driveNav: 'Google Drive',
  driveDesc:
    'Buka dan edit file Drive Anda di GenOffice; saat disimpan, file dikembalikan ke Drive. Anda juga dapat membiarkan AI mencari dan membaca file di Drive Anda.',
  driveConnect: 'Hubungkan Google Drive',
  driveConnecting: 'Masuk dengan akun Google Anda di browser dan izinkan akses…',
  driveCancel: 'Batal',
  driveConnectedAs: 'Terhubung sebagai {email}',
  driveDisconnect: 'Putuskan',
  driveDisconnectConfirm:
    'Ini menghapus login Drive dari PC ini dan meminta Google mencabut akses GenOffice. Salinan yang sudah ada di PC ini tetap tersimpan.',
  driveDisconnectYes: 'Putuskan',
  driveNotPersisted:
    'PC ini tidak dapat menyimpan login secara terenkripsi, jadi koneksi berakhir saat aplikasi ditutup.',
  driveExpired: 'Google mengakhiri koneksi: akses dicabut atau login kedaluwarsa. Hubungkan lagi.',
  driveAiAccess: 'Izinkan AI mencari dan membaca file di Drive',
  driveAiAccessDesc:
    'Jika aktif, AI di editor dapat mencari di seluruh Drive Anda dan membaca teks file. Yang dibacanya dikirim ke penyedia AI yang Anda gunakan. AI tidak dapat mengubah, menghapus, atau membagikan file Drive.',
  drivePrivacy:
    'Daftar dan isi file hanya berpindah antara PC ini dan Google. Tidak pernah melewati server pembuat GenOffice.',
  driveFailDenied: 'Koneksi gagal karena Google tidak mengizinkannya.',
  driveFailScope:
    'Koneksi gagal karena akses Drive tidak dicentang. Hubungkan lagi dan centang item Drive.',
  driveFailTimeout: 'Login tidak selesai dalam 10 menit. Coba lagi.',
  driveFailNetwork: 'Google tidak dapat dihubungi. Periksa koneksi internet Anda dan coba lagi.',
  driveMyDrive: 'Drive Saya',
  driveShared: 'Dibagikan kepada saya',
  driveRecent: 'Terbaru',
  driveSearchPlaceholder: 'Cari di Drive',
  driveSearchResults: 'Hasil untuk “{q}”',
  driveRefresh: 'Muat ulang',
  driveNotConnectedTitle: 'Google Drive belum terhubung',
  driveNotConnectedBody:
    'Setelah terhubung, Anda dapat membuka dan mengedit file Drive di sini, dan saat disimpan file dikembalikan ke Drive.',
  driveOpenSettings: 'Hubungkan di Pengaturan',
  driveEmpty: 'Tidak ada file.',
  driveLoading: 'Memuat…',
  driveLoadMore: 'Tampilkan lebih banyak',
  driveOpening: 'Membuka…',
  driveGoogleBadge: 'Format Google',
  driveGoogleNote:
    'Dokumen Google dibuka sebagai file Office. Saat disimpan, aslinya tetap seperti semula dan file Office disimpan di folder yang sama.',
  driveReadOnly: 'Hanya lihat',
  driveReadOnlyNote:
    'Anda tidak dapat mengedit file ini. Saat menyimpan, Anda akan ditanya apakah ingin menyimpan salinan ke Drive.',
  driveUnsupported: 'Aplikasi ini tidak dapat membuka jenis file ini.',
  driveErrNotConnected: 'Google Drive terputus. Hubungkan lagi di Pengaturan.',
  driveErrNotFound:
    'File tidak ditemukan. File telah dihapus, atau akun ini tidak dapat melihatnya.',
  driveErrForbidden: 'Akun ini tidak diizinkan mengunduh file ini.',
  driveErrTooLarge: 'File terlalu besar untuk dibuka.',
  driveErrRateLimit: 'Google sedang menahan permintaan sebentar. Coba lagi sesaat lagi.',
  driveErrNetwork: 'Google Drive tidak dapat dihubungi. Periksa koneksi internet Anda.',
  driveErrDisk: 'File tidak dapat disimpan di PC ini.',
  drivePickTitle: 'Lampirkan dari Drive',
  drivePickAttach: 'Lampirkan',
  drivePickSelected: '{n} dipilih',
  drivePickWorking: 'Mengambil file dari Drive…',
  drivePickFolderNote: 'Mencentang folder melampirkan hingga 20 file di dalamnya.',
  drivePickGoogleNote: 'Dokumen Google dilampirkan sebagai file Office.',
} satisfies Record<keyof typeof zh, string>
