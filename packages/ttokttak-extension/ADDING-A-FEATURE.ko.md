# 똑딱작업실 확장에 새 업무 더하기

똑딱작업실 확장은 학교 업무 사이트 화면 위에 [똑딱] 버튼을 띄우고, 그 안에 업무 버튼을 둡니다. 첫 업무는 **에듀파인 품의**입니다. 새 업무는 아래 순서로 더합니다. 순서를 빠뜨리면 `tests/core/registry-contract.test.ts`가 무엇이 빠졌는지 알려 줍니다.

## 폴더

| 폴더                      | 들어가는 것                                                                     | 지켜야 할 것                                      |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| `src/core/`               | 업무 목록(`registry.ts`), [똑딱] 홈 규칙, 받은 작업함·기억한 주소 규칙, 확장 ID | 업무 코드를 가져오지 않음(`registry.ts`는 이름만) |
| `src/sites/<사이트>/`     | 그 사이트 화면 읽기, 메뉴 열기, 화면 이름표                                     | 업무 코드를 가져오지 않음                         |
| `src/features/<업무 id>/` | 업무 화면과 채우기                                                              | 다른 업무 폴더를 가져오지 않음                    |
| `src/ext/`                | 확장 실행(background, 페이지 연결, 팝업, [똑딱] 창)                             | 업무를 이어 붙이는 곳                             |

`tests/boundaries.test.ts`가 이 규칙을 지킵니다. 한 업무의 실수가 다른 업무(특히 에듀파인 품의)를 깨지 않게 하려는 것입니다.

## 순서

1. **업무 id 정하기.** 영문 소문자·숫자·`-`, 40자 이내(예: `edufine-jichul`). 웹 앱·프로그램·연결 프로그램·주소(`/go?feature=`)가 모두 이 id로 업무를 찾으므로 한 번 정하면 바꾸지 않습니다.
2. **업무 목록에 한 줄.** `src/core/registry.ts`의 `FEATURES`에 `{ id, title, site, help, steps }`를 더합니다. `title`이 [똑딱] 창과 팝업의 버튼 이름입니다.
3. **업무 폴더.** `src/features/<id>/index.ts`에서 `Feature`(`src/core/feature.ts`)를 내보냅니다. `open(ctx, work)`는 받은 작업(`work`, 없으면 `ctx.peek()`)을 보여 주고, 끝나면 `ctx.clear()`를 부릅니다. 프로그램에서 가져오기는 `ctx.takeDesktop()`, 처음 화면은 `ctx.home()`, 문제 해결 도구는 `ctx.trouble()`입니다. 그리고 `src/ext/page-main.ts`의 `MODULES`에 이어 붙입니다.
4. **받을 작업 검사.** `src/ext/background.ts`의 `CHECKS`와 프로그램 `apps/shell/src/main/work-outbox.ts`의 `CHECKS`에 그 업무의 작업 글 검사 함수를 더합니다. 검사를 통과한 것만 보관·표시합니다.
5. **새 사이트라면.** `src/sites/<사이트>/`를 만들고 `SiteId`(`src/core/feature.ts`), `page-main.ts`의 `SITES`(그 사이트인지 알아보는 방법), background의 `SITES`에 더합니다. 확장 권한(manifest `host_permissions`)은 지금 `https://*.go.kr/*`와 웹 앱 주소뿐입니다. 권한을 넓히면 사용자에게 다시 동의를 받아야 하니 따로 결정합니다.
6. **화면 이름표.** K-에듀파인 업무라면 그 화면의 이름(입력칸·표·메뉴 ID)을 `src/sites/edufine/screen-map.ts`에 **새 선택 항목**으로 더하고, 웹 앱의 `web/runtime/client/edufine/screen-map.json`에도 같은 값을 넣습니다. 형식 번호(1)는 그대로 둡니다. 이미 깔린 확장은 모르는 항목을 무시하고 계속 이 파일을 받습니다. 메뉴는 `openMenu(nx, map, 메뉴ID)`로 엽니다. 이름은 `docs/KEDUFINE_INTERFACE_NOTES.md`와 실제 화면에서 직접 확인한 것만 씁니다.
7. **보내는 쪽.** 웹 앱·프로그램 화면에서는 `apps/shell/src/renderer/src/work-send.ts`의 `sendWorkToExtension(id, 글, …)`(웹 앱)이나 `window.aiOffice.workSend(id, 글)` 뒤 `openWorkSite(id)`(프로그램)로 보냅니다.
8. **가짜 화면과 브라우저 테스트.** `tests/fixtures/`에 가짜 화면을 만들고 `e2e/`에 그 업무 id가 들어간 테스트를 씁니다. 실행 방법은 `playwright.config.ts` 위 주석에 있습니다.
9. **지키는 것.** 확장은 어느 업무에서든 저장·결재·제출을 누르지 않습니다. 다른 사람이 만든 도구를 분석한 자료는 작업공간 밖 격리 폴더에만 두고 이 저장소에 넣지 않습니다(작업공간 AGENTS.md 0-1절).

## 버전과 배포

확장 버전은 `package.json`의 `version`이 manifest로 들어갑니다. 웹 앱을 먼저 배포하고(확장 zip, `/go`, 화면 이름표), 그다음 프로그램을 릴리스합니다. 예전 확장·예전 웹 앱과 주고받는 말(`pumui:send`, `edufine:go`, 업무 이름 없는 `take`)은 계속 받습니다.
