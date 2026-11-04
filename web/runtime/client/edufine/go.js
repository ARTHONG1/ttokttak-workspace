// /edufine/go: 똑딱작업실 (the desktop app) opens this page after [K-에듀파인으로 보내기].
// It asks the 똑딱 에듀파인 연결 extension to bring the K-에듀파인 tab forward; the extension
// closes this tab when it did. The page only speaks when there is nowhere to go.
// EXTENSION_ID must equal packages/ttokttak-extension/src/ids.ts (a test keeps them in step).
;(function () {
  var EXTENSION_ID = 'ebjaejdjilpnbcbcejmeeneahkngcmnm'
  function say(title, text, hint) {
    document.getElementById('title').textContent = title
    document.getElementById('text').textContent = text
    document.getElementById('hint').textContent = hint || ''
  }
  var noExtension = function () {
    say(
      '확장 프로그램이 필요해요',
      '이 브라우저에 「똑딱 에듀파인 연결」이 없어요. K-에듀파인을 여는 크롬에 설치한 뒤 [K-에듀파인으로 보내기]를 다시 눌러 주세요.',
      '똑딱작업실 소개 페이지 위쪽 [테스트]에서 받을 수 있어요.',
    )
  }
  var rt = window.chrome && window.chrome.runtime
  if (!rt || typeof rt.sendMessage !== 'function') return noExtension()
  var answered = false
  setTimeout(function () {
    if (!answered) noExtension()
  }, 4000)
  try {
    rt.sendMessage(EXTENSION_ID, { type: 'edufine:go' }, function (reply) {
      answered = true
      if (rt.lastError || !reply || !reply.ok) return noExtension()
      if (reply.moved === 'unknown')
        return say(
          'K-에듀파인을 한 번 열어 주세요',
          '똑딱작업실이 품의를 준비했어요. 업무포털에서 K-에듀파인 품의등록 화면을 열고 오른쪽 아래 [똑딱]을 누르면 품의가 보여요.',
          '한 번 열고 나면 주소를 기억해서, 다음부터는 이 버튼이 K-에듀파인으로 바로 옮겨 줘요.',
        )
      say('K-에듀파인으로 옮겼어요', '이 탭은 닫아도 돼요.')
    })
  } catch (e) {
    noExtension()
  }
})()
