# 릴리스 페이지 자동 동기화

배포 순서와 규칙은 [releasing.ko.md](releasing.ko.md) 하나가 정합니다. 이 문서는 릴리스를 공개한 뒤 저절로 도는 동기화만 설명합니다.

- **내용 원본 한 곳**: GitHub Release 본문. 앱 업데이트 창은 이 본문을 그대로 보여 주고, `tools/sync-release-page.mjs`가 핵심 요약과 최대 30개 공개 정식 릴리스 기록을 README(한국어·영어)와 `CHANGELOG.md`에 반영합니다.
- **언제 도는가**: Actions의 **Sync GitHub release notes to repository pages**가 정식 릴리스의 공개·수정 이벤트를 받아 돌고, 놓친 이벤트를 위해 매일 한 번 다시 확인합니다. 문서만 바뀐 커밋을 `main`에 올리므로, 끝나면 이 Mac의 `main`을 `git merge --ff-only workspace/main`으로 맞춥니다.
- **안전한 반영**: 버전 태그(`v<숫자>.<숫자>.<숫자>`) 모양의 정식 릴리스만 봅니다. 모델 릴리스(`model-…`), 초안, pre-release는 건너뜁니다. README의 지정된 주석 구역만 고치고, 본문의 HTML·링크를 직접 그리지 않고 요약 글만 넣습니다.
- **실패할 때**: 스크립트 자체 검사와 Git 비교 검사를 통과해야 커밋합니다. 실패는 Actions에 남습니다. 손으로 고칠 때는 `node tools/sync-release-page.mjs` 뒤 검토·커밋·push합니다. 시험은 `node --test tools/sync-release-page.test.mjs`.
