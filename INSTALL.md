# 똑딱작업실 설치 안내 (AI 에이전트용)

이 문서는 **사람이 아니라 AI 에이전트가 읽고 그대로 실행**하도록 쓴 설치 절차입니다.
사용자는 아래 한 줄을 Claude Code, Codex, Gemini CLI, Cursor 같은 에이전트에 붙여 넣기만 하면 됩니다.

> 똑딱작업실을 내 컴퓨터에 설치하고 세팅까지 끝내 줘. https://github.com/ARTHONG1/ttokttak-workspace/blob/main/INSTALL.md 를 읽고 그대로 따라 해.

---

## 에이전트가 지킬 원칙

1. **사용자에게 기술적인 질문을 하지 않습니다.** 운영체제, CPU 종류, 설치 경로는 직접 알아냅니다.
2. **공식 릴리스 파일만 씁니다.** 내려받는 곳은 `https://github.com/ARTHONG1/ttokttak-workspace/releases/latest` 하나뿐입니다. 다른 사이트의 설치 파일을 쓰지 않습니다.
3. **받은 파일을 확인한 뒤 설치합니다.** 릴리스에 함께 올라오는 `latest.yml`(Windows)·`latest-mac.yml`(Mac)의 `sha512` 값과 내려받은 파일의 SHA-512(base64)를 비교하고, 다르면 설치하지 않고 멈춥니다.
4. **사용자의 기존 파일과 설정을 지우지 않습니다.** 이미 설치되어 있으면 새 버전으로 덮어쓰기만 하고, 문서·설정 폴더는 건드리지 않습니다.
5. **로그인은 사용자가 합니다.** Claude·ChatGPT 계정 로그인 창이 필요하면 띄우기만 하고, 비밀번호를 대신 입력하지 않습니다.
6. **끝나면 결과를 짧게 보고합니다.** 설치 위치, 바탕화면 바로 가기, 연결한 AI 에이전트, 남은 사용자 할 일(있다면)만 적습니다.

## 1단계. 가장 쉬운 길: 설치 스크립트 실행

저장소에 들어 있는 스크립트가 2~6단계를 한 번에 합니다. 먼저 이것을 실행하고, 실패한 단계만 아래 설명대로 직접 이어서 합니다.

**macOS** (터미널):

```bash
curl -fsSL https://raw.githubusercontent.com/ARTHONG1/ttokttak-workspace/main/scripts/install/install-mac.sh | bash
```

**Windows** (PowerShell, 관리자 권한 필요 없음):

```powershell
irm https://raw.githubusercontent.com/ARTHONG1/ttokttak-workspace/main/scripts/install/install-windows.ps1 | iex
```

두 스크립트는 마지막 줄에 `TTOKTTAK_INSTALL_RESULT {...}` 한 줄을 JSON으로 찍습니다. 에이전트는 이 줄을 읽어 결과를 판단합니다. `"ok": true`면 7단계로 갑니다.

## 2단계. 내 컴퓨터에 맞는 파일 고르기

릴리스 정보는 `https://api.github.com/repos/ARTHONG1/ttokttak-workspace/releases/latest`에서 JSON으로 받습니다.

| 운영체제      | CPU                                           | 파일                                 |
| ------------- | --------------------------------------------- | ------------------------------------ |
| macOS         | Apple Silicon (M1 이후, `uname -m` = `arm64`) | `HangulAIWorkbench-<버전>-arm64.dmg` |
| macOS         | Intel (`uname -m` = `x86_64`)                 | `HangulAIWorkbench-<버전>-x64.dmg`   |
| Windows 10/11 | 64비트                                        | `HangulAIWorkbench-Setup-<버전>.exe` |

## 3단계. 설치

**macOS**

1. dmg를 `hdiutil attach -nobrowse -readonly`로 엽니다.
2. `HangulAIWorkbench.app`을 `/Applications`에 복사합니다. 쓸 수 없으면 `~/Applications`에 복사합니다.
3. `hdiutil detach`로 닫습니다.
4. 아직 Apple 공증을 받지 않은 앱이라서, 내려받은 표시를 지워야 처음 실행할 때 막히지 않습니다: `xattr -dr com.apple.quarantine <설치한 앱 경로>`

**Windows**

1. 설치 파일을 조용히 실행합니다: `HangulAIWorkbench-Setup-<버전>.exe /S`
2. 사용자 폴더(`%LOCALAPPDATA%\Programs\HangulAIWorkbench`)에 설치되고, 시작 메뉴와 바탕화면 바로 가기가 생깁니다.
3. 아직 코드 서명이 없어 SmartScreen이 막을 수 있습니다. 조용한 설치(`/S`)는 보통 그대로 진행되지만, 창이 뜨면 사용자에게 "추가 정보 → 실행"을 눌러 달라고 알립니다.

## 4단계. 바탕화면 바로 가기

- **macOS**: `~/Desktop/똑딱작업실`에 앱을 가리키는 별칭(alias)을 만듭니다. `osascript -e 'tell application "Finder" to make alias file to POSIX file "<앱 경로>" at POSIX file "<바탕화면 경로>"'`가 막히면 심볼릭 링크(`ln -s`)로 대신합니다.
- **Windows**: 설치 파일이 바탕화면 바로 가기를 만듭니다. 없으면 `WScript.Shell`로 `%USERPROFILE%\Desktop\똑딱작업실.lnk`를 만듭니다.

## 5단계. 한 번 실행해 설정 폴더 만들기

앱을 한 번 열었다가 닫으면 터미널 명령어 `ieumoffice`가 PATH에 연결됩니다.

- macOS: `open -a <앱 경로>`, 10초 기다린 뒤 `osascript -e 'quit app "HangulAIWorkbench"'`
- Windows: 바로 가기를 실행한 뒤 창을 닫습니다.

앱을 열지 않고 바로 연결하려면 앱 안의 명령어를 직접 씁니다.

- macOS: `<앱 경로>/Contents/Resources/cli/ieumoffice install-cli`
- Windows: `%LOCALAPPDATA%\Programs\HangulAIWorkbench\resources\cli\ieumoffice.cmd install-cli`

## 6단계. 내 AI 에이전트와 연결

`ieumoffice`는 문서를 읽고 만들고 고치는 명령어이자 MCP 서버입니다. 이 PC에 있는 에이전트에 등록합니다.

```bash
ieumoffice mcp install all     # Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf 중 설치된 것에 MCP 서버 등록
ieumoffice skill install all   # 같은 에이전트들에 문서 작업 스킬 설치
ieumoffice mcp list            # 등록 결과 확인
```

- 이미 같은 이름(`ieumoffice`)으로 다른 프로그램이 등록되어 있으면 `occupied`로 알려 주고 건드리지 않습니다. 이 경우 사용자에게 알리기만 합니다.
- 등록한 뒤에는 에이전트를 다시 시작해야 새 도구가 보입니다.

## 7단계. 앱 안의 AI 연결

앱의 AI 창은 사용자 PC에 로그인된 **Claude Code** 또는 **Codex**를 그대로 씁니다. 앱이 로그인 정보를 읽거나 저장하지 않습니다.

1. `claude --version` 또는 `codex --version`으로 설치 여부를 확인합니다.
2. 둘 다 없으면, 지금 이 안내를 실행하는 에이전트가 무엇인지에 맞춰 사용자에게 알려 줍니다(예: Codex로 실행 중이면 Codex가 이미 있는 것입니다).
3. 로그인이 안 되어 있으면 `claude auth login` 또는 `codex login`을 실행해 로그인 창만 띄웁니다. 로그인은 사용자가 합니다.
4. 앱의 **설정 → AI**에서 "사용할 AI"를 "자동"으로 두면 연결된 구독을 알아서 고릅니다.

## 8단계. 확인

다음이 모두 맞으면 설치가 끝난 것입니다.

- [ ] 앱 파일이 있다 (macOS `/Applications/HangulAIWorkbench.app` 또는 `~/Applications/...`, Windows `%LOCALAPPDATA%\Programs\HangulAIWorkbench\HangulAIWorkbench.exe`)
- [ ] 바탕화면에 `똑딱작업실` 바로 가기가 있다
- [ ] `ieumoffice --version`이 앱 버전을 출력한다 (새 터미널에서)
- [ ] `ieumoffice mcp list`에 이 PC의 에이전트가 `registered`로 나온다
- [ ] 앱을 열면 홈 화면이 보인다

## 지우기

- macOS: 앱을 휴지통으로 옮기고, 바탕화면 바로 가기를 지웁니다. `ieumoffice mcp uninstall all`로 에이전트 등록도 뺍니다.
- Windows: 설정 → 앱에서 "HangulAIWorkbench"를 제거합니다. 먼저 `ieumoffice mcp uninstall all`을 실행합니다.

## 문제가 생기면

- 릴리스가 아직 없으면(`releases/latest`가 404) 설치를 멈추고, 웹 체험판 https://hangul-ai-workbench-545101783843.asia-northeast3.run.app 을 사용자에게 안내합니다.
- 그 밖의 오류는 오류 메시지 전체와 함께 https://github.com/ARTHONG1/ttokttak-workspace/issues 에 올려 달라고 사용자에게 안내합니다.
