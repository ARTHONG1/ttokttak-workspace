import type { zh } from './zh'

export const ja = {
  driveNav: 'Google ドライブ',
  driveDesc:
    'ドライブのファイルを GenOffice で開いて編集し、保存するとドライブに戻します。AI にドライブのファイルを探して読ませることもできます。',
  driveConnect: 'Google ドライブに接続',
  driveConnecting: 'ブラウザで Google アカウントにログインし、アクセスを許可してください…',
  driveCancel: 'キャンセル',
  driveConnectedAs: '{email} で接続中',
  driveDisconnect: '接続を解除',
  driveDisconnectConfirm:
    'この PC からドライブのログイン情報を削除し、Google に GenOffice のアクセスを取り消すよう求めます。この PC にあるコピーは残ります。',
  driveDisconnectYes: '接続を解除',
  driveNotPersisted:
    'この PC ではログイン情報を暗号化して保存できないため、アプリを閉じると接続が切れます。',
  driveExpired:
    'Google が接続を終了しました。アクセス権が取り消されたか、ログインの有効期限が切れました。もう一度接続してください。',
  driveAiAccess: 'AI がドライブのファイルを探して読む',
  driveAiAccessDesc:
    'オンにすると、エディターの AI がドライブ全体を検索してファイルの文字を読めます。読んだ内容は使用中の AI プロバイダーに送られます。AI はドライブのファイルを変更、削除、共有できません。',
  drivePrivacy:
    'ファイルの一覧と内容は、この PC と Google の間だけでやり取りされます。GenOffice の開発者のサーバーは経由しません。',
  driveFailDenied: 'Google に許可されなかったため、接続できませんでした。',
  driveFailScope:
    'ドライブへのアクセスにチェックが入っていなかったため、接続できませんでした。もう一度接続し、ドライブの項目にチェックを入れてください。',
  driveFailTimeout: '10 分以内にログインが完了しませんでした。もう一度お試しください。',
  driveFailNetwork:
    'Google に接続できませんでした。インターネット接続を確認して、もう一度お試しください。',
  driveMyDrive: 'マイドライブ',
  driveShared: '共有アイテム',
  driveRecent: '最近使用したアイテム',
  driveSearchPlaceholder: 'ドライブを検索',
  driveSearchResults: '「{q}」の検索結果',
  driveRefresh: '更新',
  driveNotConnectedTitle: 'Google ドライブに接続していません',
  driveNotConnectedBody:
    '接続すると、ドライブのファイルをここで開いて編集でき、保存するとドライブに戻ります。',
  driveOpenSettings: '設定で接続',
  driveEmpty: 'ファイルがありません。',
  driveLoading: '読み込み中…',
  driveLoadMore: 'さらに表示',
  driveOpening: '開いています…',
  driveGoogleBadge: 'Google 形式',
  driveGoogleNote:
    'Google 形式のドキュメントは Office ファイルとして開きます。保存しても元のファイルはそのままで、同じフォルダに Office ファイルとして保存します。',
  driveReadOnly: '閲覧のみ',
  driveReadOnlyNote:
    'このファイルを編集する権限がありません。保存するときに、コピーをドライブに保存するか確認します。',
  driveUnsupported: 'このアプリでは開けない形式です。',
  driveErrNotConnected: 'Google ドライブとの接続が切れました。設定でもう一度接続してください。',
  driveErrNotFound: 'ファイルが見つかりません。削除されたか、このアカウントでは表示できません。',
  driveErrForbidden: 'このアカウントにはこのファイルをダウンロードする権限がありません。',
  driveErrTooLarge: 'ファイルが大きすぎて開けません。',
  driveErrRateLimit: 'Google がリクエストを一時的に制限しています。少し待ってからお試しください。',
  driveErrNetwork: 'Google ドライブに接続できませんでした。インターネット接続を確認してください。',
  driveErrDisk: 'ファイルをこの PC に保存できませんでした。',
  drivePickTitle: 'ドライブから添付',
  drivePickAttach: '添付',
  drivePickSelected: '{n} 件選択',
  drivePickWorking: 'ドライブから取得しています…',
  drivePickFolderNote: 'フォルダを選ぶと、その中のファイルを 20 件まで添付します。',
  drivePickGoogleNote: 'Google 形式のドキュメントは Office ファイルとして添付します。',
} satisfies Record<keyof typeof zh, string>
