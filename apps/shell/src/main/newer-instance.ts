import { type Lang, createI18n } from '@genoffice/i18n'

/**
 * One instance runs at a time: a second launch hands its arguments to the
 * running one and quits. When that second launch is a newer install (the app
 * was replaced while an old copy kept running), the running copy says so
 * instead of silently bringing its old window forward.
 */

export interface NewerInstance {
  version: string
  appPath?: string
}

/** What a launching copy adds to its single-instance lock request. */
export function secondInstancePayload(
  appVersion: string,
  appPath: string,
): { appVersion: string; appPath: string } {
  return { appVersion, appPath }
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

/** -1, 0, 1; null when either side is not a plain x.y.z[-pre] version */
function compare(a: string, b: string): number | null {
  const ma = VERSION_RE.exec(a)
  const mb = VERSION_RE.exec(b)
  if (!ma || !mb) return null
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i])
    if (d) return Math.sign(d)
  }
  // a release ranks above its own pre-release
  if (!ma[4] !== !mb[4]) return ma[4] ? -1 : 1
  if (!ma[4] || !mb[4] || ma[4] === mb[4]) return 0
  return ma[4] < mb[4] ? -1 : 1
}

/** The launched copy, when it is newer than the running one. */
export function newerInstance(
  additionalData: unknown,
  currentVersion: string,
): NewerInstance | null {
  if (!additionalData || typeof additionalData !== 'object') return null
  const data = additionalData as { appVersion?: unknown; appPath?: unknown }
  if (typeof data.appVersion !== 'string') return null
  if (compare(data.appVersion, currentVersion) !== 1) return null
  const found: NewerInstance = { version: data.appVersion }
  if (typeof data.appPath === 'string' && data.appPath) found.appPath = data.appPath
  return found
}

const t = createI18n({
  zh: {
    newerMessage: '已安装新版本',
    newerDetail:
      '当前打开的窗口是 {current} 版。请保存文档并退出应用，再次打开即可使用新版本 {next}。',
    newerQuit: '退出应用',
    newerLater: '稍后',
  },
  en: {
    newerMessage: 'A newer version is installed',
    newerDetail:
      'The open window is version {current}. Save your documents, quit the app and open it again to use version {next}.',
    newerQuit: 'Quit App',
    newerLater: 'Later',
  },
  ja: {
    newerMessage: '新しいバージョンがインストールされています',
    newerDetail:
      '現在開いているウィンドウはバージョン {current} です。文書を保存してアプリを終了し、もう一度開くと新しいバージョン {next} で起動します。',
    newerQuit: 'アプリを終了',
    newerLater: '後で',
  },
  ko: {
    newerMessage: '새 버전이 설치되어 있습니다',
    newerDetail:
      '지금 열린 창은 {current} 버전입니다. 문서를 저장하고 앱을 종료한 뒤 다시 열면 새 버전 {next}(으)로 열립니다.',
    newerQuit: '앱 종료',
    newerLater: '나중에',
  },
  fr: {
    newerMessage: 'Une version plus récente est installée',
    newerDetail:
      "La fenêtre ouverte est la version {current}. Enregistrez vos documents, quittez l'app et rouvrez-la pour utiliser la version {next}.",
    newerQuit: "Quitter l'app",
    newerLater: 'Plus tard',
  },
  de: {
    newerMessage: 'Eine neuere Version ist installiert',
    newerDetail:
      'Das geöffnete Fenster ist Version {current}. Speichern Sie Ihre Dokumente, beenden Sie die App und öffnen Sie sie erneut, um Version {next} zu verwenden.',
    newerQuit: 'App beenden',
    newerLater: 'Später',
  },
  es: {
    newerMessage: 'Hay una versión más reciente instalada',
    newerDetail:
      'La ventana abierta es la versión {current}. Guarda tus documentos, cierra la app y vuelve a abrirla para usar la versión {next}.',
    newerQuit: 'Salir de la app',
    newerLater: 'Más tarde',
  },
  th: {
    newerMessage: 'มีการติดตั้งเวอร์ชันใหม่กว่าแล้ว',
    newerDetail:
      'หน้าต่างที่เปิดอยู่คือเวอร์ชัน {current} บันทึกเอกสาร ปิดแอป แล้วเปิดใหม่เพื่อใช้เวอร์ชัน {next}',
    newerQuit: 'ปิดแอป',
    newerLater: 'ภายหลัง',
  },
  id: {
    newerMessage: 'Versi yang lebih baru telah terpasang',
    newerDetail:
      'Jendela yang terbuka adalah versi {current}. Simpan dokumen Anda, keluar dari aplikasi, lalu buka lagi untuk memakai versi {next}.',
    newerQuit: 'Keluar dari Aplikasi',
    newerLater: 'Nanti',
  },
  ru: {
    newerMessage: 'Установлена более новая версия',
    newerDetail:
      'Открытое окно — версия {current}. Сохраните документы, закройте приложение и откройте его снова, чтобы использовать версию {next}.',
    newerQuit: 'Закрыть приложение',
    newerLater: 'Позже',
  },
  ar: {
    newerMessage: 'تم تثبيت إصدار أحدث',
    newerDetail:
      'النافذة المفتوحة هي الإصدار {current}. احفظ مستنداتك وأغلق التطبيق ثم افتحه مرة أخرى لاستخدام الإصدار {next}.',
    newerQuit: 'إنهاء التطبيق',
    newerLater: 'لاحقًا',
  },
  pt: {
    newerMessage: 'Uma versão mais recente está instalada',
    newerDetail:
      'A janela aberta é a versão {current}. Salve seus documentos, feche o app e abra-o novamente para usar a versão {next}.',
    newerQuit: 'Sair do app',
    newerLater: 'Mais tarde',
  },
  it: {
    newerMessage: 'È installata una versione più recente',
    newerDetail:
      "La finestra aperta è la versione {current}. Salva i documenti, chiudi l'app e riaprila per usare la versione {next}.",
    newerQuit: "Esci dall'app",
    newerLater: 'Più tardi',
  },
  pl: {
    newerMessage: 'Zainstalowano nowszą wersję',
    newerDetail:
      'Otwarte okno to wersja {current}. Zapisz dokumenty, zamknij aplikację i otwórz ją ponownie, aby używać wersji {next}.',
    newerQuit: 'Zamknij aplikację',
    newerLater: 'Później',
  },
  cs: {
    newerMessage: 'Je nainstalována novější verze',
    newerDetail:
      'Otevřené okno je verze {current}. Uložte dokumenty, ukončete aplikaci a znovu ji otevřete, abyste používali verzi {next}.',
    newerQuit: 'Ukončit aplikaci',
    newerLater: 'Později',
  },
  nl: {
    newerMessage: 'Er is een nieuwere versie geïnstalleerd',
    newerDetail:
      'Het geopende venster is versie {current}. Sla je documenten op, sluit de app af en open hem opnieuw om versie {next} te gebruiken.',
    newerQuit: 'App afsluiten',
    newerLater: 'Later',
  },
  ms: {
    newerMessage: 'Versi yang lebih baharu telah dipasang',
    newerDetail:
      'Tetingkap yang dibuka ialah versi {current}. Simpan dokumen anda, keluar dari aplikasi dan buka semula untuk menggunakan versi {next}.',
    newerQuit: 'Keluar Aplikasi',
    newerLater: 'Kemudian',
  },
  he: {
    newerMessage: 'מותקנת גרסה חדשה יותר',
    newerDetail:
      'החלון הפתוח הוא גרסה {current}. שמרו את המסמכים, צאו מהאפליקציה ופתחו אותה שוב כדי להשתמש בגרסה {next}.',
    newerQuit: 'יציאה מהאפליקציה',
    newerLater: 'אחר כך',
  },
  hi: {
    newerMessage: 'एक नया संस्करण इंस्टॉल है',
    newerDetail:
      'खुली विंडो संस्करण {current} है। अपने दस्तावेज़ सहेजें, ऐप बंद करें और संस्करण {next} का उपयोग करने के लिए इसे फिर से खोलें।',
    newerQuit: 'ऐप बंद करें',
    newerLater: 'बाद में',
  },
  'zh-TW': {
    newerMessage: '已安裝新版本',
    newerDetail:
      '目前開啟的視窗是 {current} 版。請儲存文件並結束應用程式，再次開啟即可使用新版本 {next}。',
    newerQuit: '結束應用程式',
    newerLater: '稍後',
  },
  vi: {
    newerMessage: 'Đã cài đặt phiên bản mới hơn',
    newerDetail:
      'Cửa sổ đang mở là phiên bản {current}. Hãy lưu tài liệu, thoát ứng dụng rồi mở lại để dùng phiên bản {next}.',
    newerQuit: 'Thoát ứng dụng',
    newerLater: 'Để sau',
  },
})

export function newerInstanceText(
  lang: Lang,
  versions: { current: string; next: string },
): { message: string; detail: string; quit: string; later: string } {
  return {
    message: t(lang, 'newerMessage'),
    detail: t(lang, 'newerDetail', versions),
    quit: t(lang, 'newerQuit'),
    later: t(lang, 'newerLater'),
  }
}
