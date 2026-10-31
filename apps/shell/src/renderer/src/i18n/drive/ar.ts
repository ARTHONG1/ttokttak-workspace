import type { zh } from './zh'

export const ar = {
  driveNav: 'Google Drive',
  driveDesc:
    'افتح ملفات Drive وعدّلها في GenOffice؛ وعند الحفظ تعود إلى Drive. يمكنك أيضًا السماح للذكاء الاصطناعي بالبحث عن الملفات في Drive وقراءتها.',
  driveConnect: 'ربط Google Drive',
  driveConnecting: 'سجّل الدخول بحساب Google في المتصفح واسمح بالوصول…',
  driveCancel: 'إلغاء',
  driveConnectedAs: 'متصل بحساب {email}',
  driveDisconnect: 'قطع الاتصال',
  driveDisconnectConfirm:
    'سيؤدي هذا إلى إزالة تسجيل الدخول إلى Drive من هذا الكمبيوتر ومطالبة Google بإلغاء وصول GenOffice. تبقى النسخ الموجودة على هذا الكمبيوتر.',
  driveDisconnectYes: 'قطع الاتصال',
  driveNotPersisted:
    'لا يستطيع هذا الكمبيوتر حفظ تسجيل الدخول مشفّرًا، لذا ينتهي الاتصال عند إغلاق التطبيق.',
  driveExpired:
    'أنهت Google الاتصال: أُلغي الوصول أو انتهت صلاحية تسجيل الدخول. اربط الحساب مرة أخرى.',
  driveAiAccess: 'السماح للذكاء الاصطناعي بالبحث عن الملفات في Drive وقراءتها',
  driveAiAccessDesc:
    'عند التفعيل، يستطيع الذكاء الاصطناعي في المحررات البحث في Drive بالكامل وقراءة نص الملفات. ما يقرؤه يُرسل إلى مزوّد الذكاء الاصطناعي الذي تستخدمه. لا يستطيع الذكاء الاصطناعي تغيير ملفات Drive أو حذفها أو مشاركتها.',
  drivePrivacy:
    'تنتقل قوائم الملفات ومحتواها بين هذا الكمبيوتر وGoogle فقط، ولا تمر أبدًا عبر خادم لصانعي GenOffice.',
  driveFailDenied: 'لم يتم الاتصال لأن Google لم تسمح بذلك.',
  driveFailScope:
    'لم يتم الاتصال لأن الوصول إلى Drive لم يُحدَّد. اربط الحساب مرة أخرى وحدّد عنصر Drive.',
  driveFailTimeout: 'لم يكتمل تسجيل الدخول خلال 10 دقائق. حاول مرة أخرى.',
  driveFailNetwork: 'تعذّر الوصول إلى Google. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.',
  driveMyDrive: 'ملفاتي',
  driveShared: 'تمت مشاركتها معي',
  driveRecent: 'الأحدث',
  driveSearchPlaceholder: 'البحث في Drive',
  driveSearchResults: 'نتائج “{q}”',
  driveRefresh: 'تحديث',
  driveNotConnectedTitle: 'Google Drive غير متصل',
  driveNotConnectedBody:
    'بعد الربط، يمكنك فتح ملفات Drive وتعديلها هنا، وعند الحفظ تعود إلى Drive.',
  driveOpenSettings: 'الربط من الإعدادات',
  driveEmpty: 'لا توجد ملفات.',
  driveLoading: 'جارٍ التحميل…',
  driveLoadMore: 'عرض المزيد',
  driveOpening: 'جارٍ الفتح…',
  driveGoogleBadge: 'تنسيق Google',
  driveGoogleNote:
    'يُفتح مستند Google كملف Office. عند الحفظ يبقى الأصل كما هو ويُحفظ ملف Office في المجلد نفسه.',
  driveReadOnly: 'للعرض فقط',
  driveReadOnlyNote:
    'لا يمكنك تعديل هذا الملف. عند الحفظ ستُسأل عمّا إذا كنت تريد حفظ نسخة في Drive.',
  driveUnsupported: 'لا يستطيع هذا التطبيق فتح هذا النوع من الملفات.',
  driveErrNotConnected: 'انقطع اتصال Google Drive. اربطه مرة أخرى من الإعدادات.',
  driveErrNotFound: 'لم يُعثر على الملف. ربما حُذف، أو لا يستطيع هذا الحساب رؤيته.',
  driveErrForbidden: 'لا يُسمح لهذا الحساب بتنزيل هذا الملف.',
  driveErrTooLarge: 'الملف كبير جدًا بحيث لا يمكن فتحه.',
  driveErrRateLimit: 'تقيّد Google الطلبات مؤقتًا. حاول مرة أخرى بعد قليل.',
  driveErrNetwork: 'تعذّر الوصول إلى Google Drive. تحقق من اتصالك بالإنترنت.',
  driveErrDisk: 'تعذّر حفظ الملف على هذا الكمبيوتر.',
  drivePickTitle: 'إرفاق من Drive',
  drivePickAttach: 'إرفاق',
  drivePickSelected: 'تم تحديد {n}',
  drivePickWorking: 'جارٍ جلب الملفات من Drive…',
  drivePickFolderNote: 'تحديد مجلد يرفق ما يصل إلى 20 ملفًا منه.',
  drivePickGoogleNote: 'يُرفق مستند Google كملف Office.',
} satisfies Record<keyof typeof zh, string>
