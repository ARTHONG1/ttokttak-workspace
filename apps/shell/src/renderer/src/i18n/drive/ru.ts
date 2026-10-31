import type { zh } from './zh'

export const ru = {
  driveNav: 'Google Диск',
  driveDesc:
    'Открывайте и редактируйте файлы с Диска в GenOffice — при сохранении они возвращаются на Диск. Можно также разрешить ИИ искать и читать файлы на вашем Диске.',
  driveConnect: 'Подключить Google Диск',
  driveConnecting: 'Войдите в аккаунт Google в браузере и разрешите доступ…',
  driveCancel: 'Отмена',
  driveConnectedAs: 'Подключено: {email}',
  driveDisconnect: 'Отключить',
  driveDisconnectConfirm:
    'Вход в Диск будет удалён с этого компьютера, а Google получит запрос отозвать доступ GenOffice. Копии на этом компьютере останутся.',
  driveDisconnectYes: 'Отключить',
  driveNotPersisted:
    'Этот компьютер не может хранить вход в зашифрованном виде, поэтому подключение закончится при закрытии приложения.',
  driveExpired:
    'Google завершил подключение: доступ отозван или срок входа истёк. Подключитесь снова.',
  driveAiAccess: 'Разрешить ИИ искать и читать файлы на Диске',
  driveAiAccessDesc:
    'Если включено, ИИ в редакторах может искать по всему Диску и читать текст файлов. Прочитанное отправляется выбранному поставщику ИИ. ИИ не может изменять, удалять или открывать доступ к файлам на Диске.',
  drivePrivacy:
    'Списки и содержимое файлов передаются только между этим компьютером и Google и никогда не проходят через серверы создателей GenOffice.',
  driveFailDenied: 'Подключиться не удалось: Google не разрешил доступ.',
  driveFailScope:
    'Подключиться не удалось: доступ к Диску не был отмечен. Подключитесь снова и отметьте пункт Диска.',
  driveFailTimeout: 'Вход не завершился за 10 минут. Попробуйте ещё раз.',
  driveFailNetwork:
    'Не удалось связаться с Google. Проверьте подключение к интернету и попробуйте ещё раз.',
  driveMyDrive: 'Мой диск',
  driveShared: 'Доступные мне',
  driveRecent: 'Недавние',
  driveSearchPlaceholder: 'Поиск на Диске',
  driveSearchResults: 'Результаты по запросу «{q}»',
  driveRefresh: 'Обновить',
  driveNotConnectedTitle: 'Google Диск не подключён',
  driveNotConnectedBody:
    'После подключения здесь можно открывать и редактировать файлы с Диска, а при сохранении они возвращаются на Диск.',
  driveOpenSettings: 'Подключить в настройках',
  driveEmpty: 'Файлов нет.',
  driveLoading: 'Загрузка…',
  driveLoadMore: 'Показать ещё',
  driveOpening: 'Открытие…',
  driveGoogleBadge: 'Формат Google',
  driveGoogleNote:
    'Документ Google открывается как файл Office. При сохранении оригинал не меняется, а в той же папке сохраняется файл Office.',
  driveReadOnly: 'Только просмотр',
  driveReadOnlyNote:
    'Вы не можете изменять этот файл. При сохранении появится вопрос, сохранить ли копию на Диск.',
  driveUnsupported: 'Это приложение не может открыть такой файл.',
  driveErrNotConnected: 'Google Диск отключён. Подключите его снова в настройках.',
  driveErrNotFound: 'Файл не найден. Он удалён, или этот аккаунт его не видит.',
  driveErrForbidden: 'Этому аккаунту не разрешено скачивать этот файл.',
  driveErrTooLarge: 'Файл слишком большой, чтобы его открыть.',
  driveErrRateLimit: 'Google временно ограничивает запросы. Попробуйте чуть позже.',
  driveErrNetwork: 'Не удалось связаться с Google Диском. Проверьте подключение к интернету.',
  driveErrDisk: 'Не удалось сохранить файл на этом компьютере.',
  drivePickTitle: 'Прикрепить с Диска',
  drivePickAttach: 'Прикрепить',
  drivePickSelected: 'Выбрано: {n}',
  drivePickWorking: 'Получение файлов с Диска…',
  drivePickFolderNote: 'Если отметить папку, будет прикреплено до 20 файлов из неё.',
  drivePickGoogleNote: 'Документ Google прикрепляется как файл Office.',
} satisfies Record<keyof typeof zh, string>
