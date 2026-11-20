# 배포·업데이트 지침

똑딱작업실, 똑딱생기부, 똑딱AI 모델, 공개 웹을 새 버전으로 내는 규칙과 순서입니다. **배포에 관한 정본은 이 문서 하나입니다.** 다른 문서(작업공간 AGENTS.md, 릴리스 스킬, RELEASE_AUTOMATION.md)는 이 문서를 가리키기만 하고, 어긋나면 이 문서를 따릅니다. 문서와 실제 절차가 달라지면 그 자리에서 이 문서를 고칩니다.

마지막 정리: 2026-11-20, 0.18.0(똑딱AI 하나로) 배포 때. 처음 쓴 것은 0.17.0 배포 뒤로, 그 배포에서 생긴 문제(아래 8)를 다시 겪지 않도록 썼습니다.

---

## 1. 원칙 다섯 가지

1. **정해진 곳에서만 만든다.** 코드는 작업공간 `program/`의 커밋된 `main` 하나입니다. 릴리스 태그는 **그 커밋 그대로 CI가 통과한 커밋**에만 붙입니다.
2. **기다리는 일은 동시에 한다.** CI, Windows·Mac 빌드(Actions), 웹 이미지 빌드(Cloud Build), 이 Mac의 패키징은 서로 기다릴 필요가 없습니다. 버전 커밋을 올린 직후 한꺼번에 시작합니다(4-2).
3. **공개 전에 실제 경로로 확인한다.** 시험용 서버가 아니라 실제 GitHub에서 받아 보고, 빌드 폴더의 앱이 아니라 설치한 앱으로 확인합니다. 0.2.0의 모델 받기 문제는 로컬 시험이 모두 통과했는데도 실제 GitHub에서만 드러났습니다.
4. **한 번 올린 것은 바꾸지 않는다.** 공개한 태그, 설치 파일, 모델 릴리스의 파일은 고치거나 지우지 않습니다. 문제가 있으면 번호를 올려 새로 냅니다. 설치된 앱은 더 큰 번호로만 업데이트하고, 옛 앱은 자기가 아는 모델 주소를 계속 씁니다.
5. **"배포해"는 공개까지의 승인이다.** 사용자가 배포나 릴리스를 요청했으면 빌드, 확인, 릴리스 공개, 웹 배포, 이 Mac 설치까지가 승인 범위입니다. 중간에 다시 묻지 않습니다. 멈추고 묻는 것은 9에 적은 경우뿐입니다.

공개 배포는 저장소 주인이 [Anthropic 상업 약관](https://www.anthropic.com/legal/commercial-terms)에 동의한 상태를 전제로 합니다. 이 앱은 사용자 PC의 Claude Code를 실행하므로, 배포에 대한 약관 동의는 코드로 대신할 수 없는 개발자 본인의 의무입니다. 동의가 확인되지 않았으면 배포하지 않습니다(9).

## 2. 무엇이 어디로 나가는가

| 대상                    | 나가는 곳                                                                              | 태그                                                  | 파일                                                                                                                                                 | 사용자 업데이트                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 똑딱작업실              | 공개 저장소 `ARTHONG1/ttokttak-workspace` 릴리스                                       | `v<버전>`                                             | Apple Silicon `-arm64.dmg`·`-arm64-mac.zip`, Intel `-x64.dmg`·`-mac.zip`, Windows `Setup-<버전>.exe`, `latest-mac.yml`, `latest.yml`, 각 `.blockmap` | 앱 안의 업데이트 확인(Windows는 electron-updater, Mac은 앱이 zip을 직접 받아 바꿈)                                                                                        |
| 똑딱생기부              | `ARTHONG1/ttokttak-saenggibu` 릴리스(배포 전용, 소스는 작업실 저장소 `apps/saenggibu`) | 거기서 `v<버전>`, 작업실 저장소에 `saenggibu-v<버전>` | `-arm64.dmg`·`-arm64-mac.zip`, `Setup-<버전>.exe`, `SHA256SUMS.txt`                                                                                  | 아직 자동 업데이트 없음(다시 설치)                                                                                                                                        |
| 똑딱AI 모델(두 앱 공용) | `ttokttak-workspace`의 `model-<날짜>[-n]` 릴리스(최신으로 표시하지 않음)               | `model-YYYYMMDD`                                      | 기본 모델·어댑터 `.gguf`, `MODEL-NOTICE.txt`, `MODEL-LICENSE.txt`                                                                                    | 작업실은 `apps/docs/src/main/local-ai-model-files.ts`(파일 4개), 생기부는 `apps/saenggibu/src/shared/model.ts`(기본 모델과 생기부 어댑터)에 고정한 파일을 처음 쓸 때 받음 |
| 공개 웹                 | Cloud Run `hangul-ai-workbench`                                                        | 이미지 `main-<커밋 8자리>`                            | 웹 묶음(모델 없음, AI는 Vertex Gemini)                                                                                                               | 배포 즉시                                                                                                                                                                 |
| 이 Mac 설치본           | `~/Applications/HangulAIWorkbench.app`                                                 | —                                                     | —                                                                                                                                                    | `npm run install:app`으로만                                                                                                                                               |

똑딱AI는 하나입니다(0.18.0·생기부 0.3.0부터). 두 앱이 같은 모델 릴리스의 같은 기본 모델과 생기부 어댑터를 받고, 작업실은 문서·품의 어댑터를 더 받습니다. 모델을 바꾸면 두 앱의 고정 목록을 함께 바꾸고 두 앱을 함께 냅니다. 옛 `ttokttak-saenggibu`의 `model-v7b`는 0.2.x 생기부가 쓰므로 지우지 않습니다.

Linux판은 지금 만들지 않습니다(작업 파일 없음). 다시 낼 때 이 표에 더합니다.

## 3. 버전 규칙

- 똑딱작업실 버전은 `apps/shell/package.json`의 `version`, 똑딱생기부는 `apps/saenggibu/package.json`입니다. `package-lock.json`의 같은 자리도 함께 바꿉니다. 저장소 맨 위 `package.json`의 버전은 앱과 관계없습니다.
- `숫자.숫자.숫자`만 씁니다. 고친 것만 있으면 끝자리, 기능이 들어가거나 **모델이 바뀌면** 가운데 자리를 올립니다. 앱이 모델 목록을 고정하므로, 모델만 바뀌어도 앱 버전을 올립니다.
- 한 번 쓴 번호는 다시 쓰지 않습니다. 실패한 릴리스의 번호도 건너뜁니다.

## 4. 똑딱작업실 릴리스 순서

전체 소요는 동시에 진행하면 약 50분입니다. 대부분 기다리는 시간입니다(CI 약 33분, Windows 빌드 약 25분, Mac 빌드 약 25분, 이 Mac 전체 빌드와 패키징 약 15분, Cloud Build 약 11분). 순서대로 하나씩 기다리면 2시간이 넘습니다.

### 4-1. 준비 (이 Mac, 약 15분)

1. `git status`가 깨끗한 `main`에서 시작합니다.
2. 바꾼 패키지만 확인합니다: 형 검사, 그 패키지의 테스트(패키지 폴더 안에서, `npm run test -w <패키지>`), `npm run format:check`, 바꾼 파일 `eslint`. **전체 테스트는 CI에 맡깁니다.** 이 Mac에서 전체를 낮은 우선순위로 돌리면 15분 넘게 걸리고, 저장소 맨 위에서 돌리면 폴더 기준으로 파일을 읽는 테스트 몇 개가 거짓으로 실패합니다.
3. 릴리스 본문 `docs/releases/v<버전>.md`를 씁니다(형식은 6). `docs/tracking/status.md` 맨 위에 한 문단을 더합니다.
4. 버전을 올립니다(3). 위 문서들과 함께 **커밋 하나**로 묶어 `release: <버전> — <한 줄>`로 커밋하고 push합니다.
5. **이 커밋의 CI가 끝날 때까지 `main`에 다른 커밋을 올리지 않습니다.** CI는 새 커밋이 오면 앞의 실행을 취소하므로, 그러면 릴리스 커밋에 통과 기록이 남지 않습니다(0.17.0에서 실제로 그랬습니다). 시험 추가 같은 작은 커밋도 릴리스가 끝난 뒤에 올립니다.

### 4-2. 동시에 시작 (push 직후)

- **Actions → Windows build**와 **Actions → macOS build**를 `main`에서 실행합니다. release_tag 칸은 비워 둡니다(결과물만 남김). Windows 빌드는 실행기만 넣은 설치 파일을 만들고, 모델 릴리스에서 파일을 받아 두 실행이 모두 답하는지까지 봅니다. macOS build의 Apple Silicon 결과물에는 내장 AI 실행기가 없으므로 **Intel 파일만** 씁니다.
- **이 Mac에서 Apple Silicon판**을 만듭니다. 내장 AI 실행기를 넣는 Apple판은 아직 이 Mac에서만 만듭니다(10의 C에서 바꿀 예정).

  ```bash
  cd program
  node tools/prepare-embedded-ai.mjs "$HOME/Desktop/인공지능 모델/.local-ai/runtime/llama-b12167"
  PATH=$HOME/.cargo/bin:$PATH taskpolicy -b nice -n 19 npm run build:all
  PATH=$HOME/.cargo/bin:$PATH GENOFFICE_EMBED_LOCAL_AI=1 taskpolicy -b nice -n 19 \
    npm run dist:mac -w @genoffice/shell -- --publish never
  ```

  버전을 올린 뒤에는 **반드시 `build:all`부터** 합니다. 앱 하나만 빌드하면 패키징 보호 장치가 "빌드가 소스보다 오래됨"(새 `package.json`)으로 멈춥니다.

- **공개 웹 이미지**를 만듭니다. 위 `build:all`이 끝난 뒤 `node web/build.mjs`, 다음 `docs/WEB_CLOUD_RUN_DEPLOY.md`(작업공간)의 `gcloud builds submit … --async`. 이미지 태그는 `main-<그 커밋 8자리>`입니다. 웹만 배포할 때도 `build:all`부터 합니다.

### 4-3. 확인 (이 Mac, 약 10분)

1. `npm run install:app`으로 설치합니다. 실행 중이면 멈추니 앱을 닫고 다시 합니다.
2. 설치본으로 화면 시험을 돌립니다.

   ```bash
   EXE=$HOME/Applications/HangulAIWorkbench.app/Contents/MacOS/HangulAIWorkbench
   GENOFFICE_E2E_PACKAGED_EXECUTABLE=$EXE E2E_NO_VIDEO=1 npx playwright test \
     e2e/local-ai-first-run.spec.ts -g "fresh installation|HWPX paragraph"
   GENOFFICE_E2E_PACKAGED_EXECUTABLE=$EXE E2E_NO_VIDEO=1 npx playwright test e2e/local-ai-models.spec.ts
   ```

   설치본이 받아 둔 모델 파일을 시험용 폴더에 하드 링크로 넣어 쓰므로 2.2GB를 다시 받지 않습니다. **모델 목록을 바꾼 릴리스**는 실제 GitHub에서 받는 시험도 돌립니다: `GENOFFICE_E2E_LOCAL_AI_DOWNLOAD=1 npx playwright test e2e/local-ai-models.spec.ts`(약 9분).

3. `bash tools/preview-ensure.sh`(작업공간 루트) 뒤 미리보기에서 한글 문서 AI 전송이나 생기부 행발 1명을 실제로 보내 답을 확인합니다.
4. 릴리스 커밋의 CI가 초록인지, 마지막 밤 화면 검사(Actions → "E2E (Electron)")도 초록인지 확인합니다. `npm run status`의 "자동 검사" 줄에 둘 다 나옵니다. 밤 검사가 빨간 채로 내지 않습니다. 화면을 바꾼 릴리스는 릴리스 커밋으로 E2E를 한 번 돌립니다(약 45분, CI와 동시에).

### 4-4. 공개

1. 파일을 한 폴더에 모읍니다. Apple판은 이 Mac의 `apps/shell/release/`, Intel판은 macOS build 결과물, Windows판은 Windows build 결과물에서 가져옵니다.
2. `latest-mac.yml`을 합칩니다. `files`에 Apple 두 항목(이 Mac의 것)과 Intel 두 항목(Actions의 것)을 넣고, `path`와 `sha512`는 Apple zip을 가리킵니다. 각 파일의 `openssl dgst -sha512 -binary <파일> | base64`와 크기가 목록과 같은지 확인합니다. **설치 파일과 목록을 다른 빌드에서 섞지 않습니다.**
3. 초안 릴리스를 만들어 올립니다. 대상은 **전체 커밋 해시**로 적습니다(짧은 해시는 오타가 나도 바로 알 수 없습니다).

   ```bash
   gh release create v<버전> -R ARTHONG1/ttokttak-workspace --draft --target <전체 해시> \
     --title v<버전> --notes-file docs/releases/v<버전>.md <모은 파일 전부>
   ```

4. **업데이트 경로를 건드린 릴리스는 베타 예행을 합니다.** 업데이트·패키징·모델 받기 코드를 바꿨거나 가운데 자리를 올린 릴리스가 해당됩니다. 초안을 "pre-release"로 공개하고, 옛 버전 설치본의 설정 → 정보 → 업데이트 채널을 "베타 버전"으로 바꿔 업데이트를 끝까지 받아 봅니다(7). 그 밖의 릴리스는 이 단계를 건너뜁니다.
5. **공개 웹을 먼저 배포합니다**(`gcloud run deploy … --image …:main-<릴리스 커밋>`). 이때 이 Mac의 `main`은 릴리스 커밋 그대로여야 하고 커밋 안 된 변경도 없어야 합니다. 그렇지 않으면 Codex 훅이 배포를 막습니다. 확인 중에 고친 시험 같은 것은 따로 보관했다가 8에서 커밋합니다. 공개 주소의 `/`·`/intro`가 200인지, 실제 AI 답이 오는지 확인하고, 작업공간 `docs/WEB_CLOUD_RUN_DEPLOY.md` 맨 위에 한 줄을 기록합니다.
6. 정식으로 공개합니다: `gh release edit v<버전> --draft=false --latest`(베타였으면 `--prerelease=false`도). `releases/latest/download/latest-mac.yml`과 `latest.yml`이 새 버전인지 봅니다.
7. 공개하면 Actions의 **Sync GitHub release notes to repository pages**가 README와 CHANGELOG를 고쳐 `main`에 커밋합니다. 끝나면 `git fetch workspace && git merge --ff-only workspace/main`으로 이 Mac의 `main`을 맞춥니다. 웹을 공개보다 먼저 배포하는 이유가 이 커밋입니다(이것을 받은 뒤에는 이미지 이름이 현재 커밋과 달라짐).
8. 보관해 둔 수정이 있으면 이제 커밋·push합니다. 작업공간 루트에서 `npm run status`. "고칠 것 없음"이 나와야 끝입니다. 임시 폴더(`/private/tmp`의 작업 파일, 시험용 사용자 폴더)를 지웁니다.

## 5. 똑딱AI 모델을 바꿀 때

1. 새 파일을 `ttokttak-workspace`의 새 모델 릴리스로 먼저 올립니다: `gh release create model-YYYYMMDD --latest=false`. 파일마다 2GiB(2,147,483,648바이트) 미만이어야 하고, `MODEL-NOTICE.txt`(각 파일의 크기·SHA256·출처)와 `MODEL-LICENSE.txt`를 함께 올립니다.
2. 올린 뒤 로그인 없이 받아지는지(`curl -L -r <끝 근처>-`가 206), 받은 파일의 해시가 맞는지 확인합니다.
3. `local-ai-model-files.ts`의 릴리스 이름, 크기, SHA256을 바꾸고 앱 버전을 올립니다(3). 새 앱은 새 파일을 받은 뒤 옛 파일을 지웁니다.
4. 실제 받기 시험(4-3의 2)을 꼭 돌립니다.
5. 업데이트하는 사용자가 다시 받을 양을 릴리스 본문 첫 문단에 적습니다. 인터넷이 막힌 곳에서는 업데이트 뒤 모델을 받을 때까지 내장 AI가 멈추기 때문입니다.
6. 이미 올린 모델 릴리스는 지우거나 파일을 바꾸지 않습니다. 그 버전 앱을 쓰는 사람이 아직 그 주소에서 받습니다.
7. 이 Mac 설치본에는 모델 프로젝트의 원본을 복제(`cp -c`, 공간을 더 쓰지 않음)로 `~/Library/Application Support/HangulAIWorkbench/local-ai-models/`에 넣어 2.2GB를 다시 받지 않게 할 수 있습니다. 앱이 처음 켤 때 해시를 한 번 확인합니다.

## 6. 릴리스 본문

사용자가 앱의 업데이트 창에서 그대로 읽습니다(앱은 번역하지 않음).

- 첫 문단에 한두 줄 요약 → `## 바뀐 것`(새로 들어간 것·고친 것) → `## 알려진 한계` → 맨 아래 `## 설치`.
- 사용자가 체감하는 변화만, 확인한 것만 씁니다. 자동 검사 숫자를 품질 보장처럼 쓰지 않습니다.
- 다 쓴 뒤 번역투와 AI 투를 걷어내 사람 말로 다듬습니다.
- `## 설치`에는 그 릴리스에 올린 플랫폼을 모두 적고, 서명이 없어 처음 열 때 뜨는 경고와 넘기는 방법을 안내 문서로 연결합니다.

## 7. 사용자 쪽 업데이트 동작 (알아 둘 것)

- 앱은 사용자가 "업데이트 확인"을 누를 때 확인합니다. 설정 → 정보의 "자동으로 업데이트 확인"을 켠 사람만 켠 뒤 15초, 그 뒤 4시간마다 확인합니다.
- 안정 채널은 GitHub의 "최신 릴리스"만, 베타 채널은 pre-release까지 봅니다. 초안(draft)은 아무에게도 보이지 않습니다.
- Mac 앱은 `latest-mac.yml`의 sha512로 zip을 확인한 뒤 스스로 바꿉니다. zip과 `latest-mac.yml`이 빠지면 Mac 사용자는 업데이트를 못 받습니다. Windows는 `latest.yml`과 설치 파일이 필요합니다.
- 설치 파일에는 서명이 없습니다(결정 0031, 0056). 한 번 서명한 버전을 내면 그 뒤로 서명 없는 버전으로는 업데이트되지 않으므로, 서명은 9의 결정 사항입니다. `CSC_LINK`·`WIN_CSC_LINK`가 없는 상태로 빌드합니다.

## 8. 시간을 잡아먹은 함정 (실제로 겪은 것)

| 함정                                                                                                                             | 피하는 법                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 소스를 바꾸고 앱 하나만 빌드해 패키징·웹 묶음이 멈춤(보호 장치는 모든 편집기의 빌드 결과가 가장 새 소스보다 새것이어야 통과시킴) | 커밋 뒤 `build:all`부터(4-2). 웹만 배포할 때도 같음                                                                   |
| 릴리스 중 다른 커밋을 올려 릴리스 커밋의 CI가 취소됨                                                                             | 릴리스가 끝날 때까지 push 금지(4-1의 5)                                                                               |
| `--target`에 짧은 해시를 잘못 적음                                                                                               | 전체 해시를 복사해 씀                                                                                                 |
| `latest-mac.yml`을 손으로 합침                                                                                                   | 해시·크기 대조를 반드시 함(4-4의 2), 10의 B로 자동화                                                                  |
| 로컬 시험은 통과했는데 실제 GitHub에서 받기가 멈춤(한글 User-Agent를 400으로 거절)                                               | 실제 GitHub 받기 시험(4-3의 2), 시험 서버도 같은 거절을 흉내 냄                                                       |
| 덮개를 닫아 2GB 받기가 끊김                                                                                                      | 긴 받기 시험은 전원 연결·덮개 열림 상태에서                                                                           |
| Playwright가 앱을 닫지 못해 Electron이 남음                                                                                      | 시험 뒤 `pgrep -fl Electron`으로 확인하고 정리                                                                        |
| 전체 테스트를 이 Mac에서 돌려 15분 소모                                                                                          | 바꾼 패키지만 이 Mac에서, 전체는 CI                                                                                   |
| `gh`, `gcloud`가 기본 PATH에 없음                                                                                                | `gh`: `~/.agent-reach/tools/runtimes/gh_2.102.0_macOS_arm64/bin/gh`, `gcloud`: `~/.local/google-cloud-sdk/bin/gcloud` |
| 웹 이미지를 만든 뒤 커밋을 올리거나 커밋 안 된 변경을 남겨 Codex 훅이 웹 배포를 막음(2026-11-20 두 번)                           | 이미지를 만든 커밋 그대로, 변경 없이 배포(4-4의 5). 그 사이 고친 것은 따로 보관                                       |

## 9. 멈추고 사용자에게 묻는 경우

- 서명 인증서 도입(되돌릴 수 없음), 배포 저장소나 공개 범위 변경
- 이미 공개한 릴리스·태그·모델 릴리스를 지우거나 바꾸는 일(문제 있는 릴리스를 pre-release로 내려 퍼지지 않게 하는 것은 묻지 않고 해도 됩니다. 그 뒤 바로 알림)
- 확인 단계(4-3)가 실패했는데 원인을 고치지 못한 채 공개해야 하는 상황
- 보호 장치(release-guard, Codex 훅)가 막았는데 원인을 고칠 수 없는 경우. 우회하지 않습니다.

## 10. 이 절차를 더 짧게 만들 작업 (순서대로)

이 지침의 손 작업은 아래가 끝나는 대로 지우고 고칩니다.

- **A. 배포 전 점검 명령** `npm run release:check`: 버전이 `package.json`·잠금 파일·릴리스 본문에서 맞는지, 작업 트리가 깨끗한지, 그 커밋 CI가 초록인지, 앱에 고정한 모델 파일이 실제로 그 크기로 받아지는지 한 번에 확인
- **B. 릴리스 조립 스크립트**: Actions 결과물 내려받기, `latest-mac.yml` 자동 합치기, 해시 대조, 전체 해시로 초안 생성
- **C. 세 플랫폼을 Actions에서**: 버전 태그를 push하면 Apple판(내장 AI 실행기 포함)·Intel판·Windows판을 함께 만들고 각 설치판이 실제 GitHub에서 모델을 받아 답하는지 시험한 뒤 초안을 만듦. 이 Mac의 패키징(4-2)이 없어짐
- **D. 똑딱생기부**: 설치 명령(`npm run install:saenggibu`), 자동 업데이트, 같은 릴리스 흐름
- **E. 주간 실제 받기 시험**: 공개된 모델 릴리스에서 매주 한 번 받아 보아, GitHub 쪽 변화를 사용자보다 먼저 발견

## 부록: 똑딱생기부 릴리스 (D가 끝나기 전)

1. `apps/saenggibu/package.json`과 잠금 파일의 버전을 올려 커밋·push하고, 같은 커밋에 `saenggibu-v<버전>` 태그를 붙여 push합니다.
2. Actions → **똑딱생기부 Windows build** 실행(설치판이 실제 GitHub에서 모델을 받아 행발을 쓰는 시험 포함). 동시에 이 Mac에서 `taskpolicy -b nice -n 19 npm run dist:mac -w @ttokttak/saenggibu`.
3. 이 Mac 설치본 교체: 실행 중이 아닌지 확인 → 옛 앱을 `~/Documents/똑딱작업실-이전-앱.noindex/`로 옮기고 등록 해제 → `release/mac-arm64/TtokttakSaenggibu.app`을 `~/Applications`에 `ditto` → 등록. 그 뒤 `SAENGGIBU_PACKAGED_EXECUTABLE=… npx playwright test -c apps/saenggibu/e2e/playwright.config.ts installed.spec.ts`.
4. 파일을 모아 `SHA256SUMS.txt`를 만들고 `ttokttak-saenggibu`에 `gh release create v<버전> --latest`. 배포 저장소 안내(`~/Documents/똑딱-배포/ttokttak-saenggibu/README.md`)가 바뀌었으면 커밋·push.

## 부록: Windows 손 빌드 (Actions를 쓸 수 없을 때만, 결정 0056)

Windows PC에서 `npm run native:build -w @genoffice/sheets` → `xlsx-sidecar.exe`를 `target/x86_64-pc-windows-gnu/release/`로 복사 → `npm run dist:win -- -- --publish never`(`--` 두 번). 서명 환경 변수가 없는 상태에서 만듭니다. 손 빌드 파일에는 출처 증명이 없습니다.
