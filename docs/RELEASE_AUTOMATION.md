# 배포와 GitHub 페이지 동기화

똑딱작업실의 제품 저장소는 공개 `ARTHONG1/ttokttak-workspace`이며, `program/main`의 커밋된 코드만 배포합니다. 제품 화면의 이름은 `똑딱작업실`, 내부 실행 이름과 설치 파일은 `HangulAIWorkbench`입니다.

## 매 버전 릴리스 순서

1. `apps/shell/package.json`과 `package-lock.json`의 `apps/shell.version`을 같은 값으로 올립니다. 내장 모델의 원본·양자화 모델·실행기 리비전과 SHA-256을 확인합니다. 필요한 기능을 개발하고 테스트합니다.
2. `docs/releases/v<버전>.md`에 **요약 한 문단, 새로 들어간 것, 고친 것, 적용 플랫폼/한계, 설치**를 한국어로 적습니다. 검증한 사항만 적고 특화 학습 계획을 이미 된 기능으로 표현하지 않습니다. 문서 내용은 앱의 업데이트 창에도 표시됩니다.
3. 로컬에서 `node --test tools/sync-release-page.test.mjs`, `npx vitest run` 및 변경 패키지의 타입 검사·빌드를 끝냅니다. 배포 전에 `git diff --check`와 출처·비밀·개인 문서 검사를 하고 **깨끗한 `main`**으로 커밋·공개 저장소에 push합니다.
4. 버전 태그 `v<버전>`을 해당 커밋에 붙이고 GitHub 릴리스를 작성합니다. 본문에는 2번의 내용을 사용합니다. 설치 파일을 먼저 만들고 실제 모델 응답·문서 왕복 저장을 확인한 다음 안정 버전으로 공개합니다. `v0.16.2`의 내장 AI 배포 대상은 Apple Silicon Mac입니다.
5. Mac Apple Silicon 내장형 빌드는 `tools/prepare-embedded-ai.mjs`로 **동일한 SHA-256의 GGUF와 해당 플랫폼 llama.cpp**를 준비하고, `GENOFFICE_EMBED_LOCAL_AI=1 npm run dist:mac -w @genoffice/shell -- --publish never`로 만듭니다. `build/local-ai/`와 검사 중간 산출물은 Git에 넣지 않습니다. 패키지 내 `local-ai/manifest.json`, 실제 모델 대답, 편집·저장, 업데이트 피드 파일을 확인합니다.
6. `HangulAIWorkbench-<버전>-arm64.dmg`, `...-arm64-mac.zip`, `latest-mac.yml`을 릴리스에 함께 게시합니다. 자동 업데이트가 일치하는 설치 파일의 SHA-512를 검증하므로 **zip과 `latest-mac.yml`을 서로 다른 빌드에서 혼합하지 않습니다**. 기존 Mac·Windows 워크플로는 기본적으로 모델을 포함하지 않습니다. 특히 기존 `.github/workflows/mac-build.yml`은 `v0.16.2` 이후 릴리스에 모델 없는 설치 파일을 덮어쓰지 못하도록 자동 첨부를 거부합니다.
7. GitHub Actions의 **Sync GitHub release notes to repository pages**가 안정 릴리스를 게시하거나 수정한 이벤트를 받아 README(한국어·영어)와 `CHANGELOG.md`를 자동 갱신해 `main`에 커밋합니다. 이벤트가 누락되면 매일 한 번 다시 확인합니다. 수동 복구는 `node tools/sync-release-page.mjs` 후 검토·커밋·push합니다.
8. GitHub에서 저장소 README의 최근 버전, [릴리스](https://github.com/ARTHONG1/ttokttak-workspace/releases), CHANGELOG의 버전·변경점을 대조합니다. 앱의 업데이트 창에서 같은 내용을 확인합니다.

## 자동화가 책임지는 부분

- **내용 원본 한 곳**: GitHub Release 본문. 앱 업데이트 창은 이 본문을 사용하며, `tools/sync-release-page.mjs`가 핵심 요약과 최대 30개 공개 정식 릴리스 기록을 README/CHANGELOG에 반영합니다.
- **안전한 반영**: 버전 태그가 올바른지 확인하고 README의 지정된 주석 구역만 수정합니다. 릴리스에서 붙인 HTML·링크를 직접 렌더링하지 않고 요약 글만 표시합니다.
- **실패 시 감지**: 동기화 워크플로에서 스크립트 자체 검사를 실행하고 Git 비교 검사를 통과해야 문서만 커밋합니다. 실패는 GitHub Actions에 남습니다. `main`이 보호되어 쓰기가 막히면 관리자 권한·Actions 쓰기 권한을 확인해야 합니다.
- **한계**: 모델 파일과 설치 파일의 실제 빌드·시험, 문서의 정확성 검토, 코드 버전 증가는 자동 릴리스 문서 동기화의 범위 밖입니다.
