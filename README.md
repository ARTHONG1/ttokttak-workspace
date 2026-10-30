# 똑딱작업실 (ttokttak-studio)

**한국어** · [English](README.en.md)

똑딱작업실은 한글(HWP·HWPX), 워드, 엑셀, 파워포인트, PDF, 마크다운, HTML 문서와
마인드맵을 한 창에서 열고 고치는 데스크톱 오피스 프로그램입니다. 편집기마다 AI
창이 있어서, 말로 부탁하면 AI가 앱의 편집 도구로 문서를 직접 고칩니다. 무엇이
바뀌었는지 보이고, 되돌릴 수 있습니다.

AI는 **내 PC에 설치하고 로그인해 둔 Claude Code 또는 Codex**로 돌아갑니다. 앱은
로그인 정보를 읽거나 저장하지 않고, 그 프로그램을 실행해 요청을 넘기기만 합니다.

똑딱작업실은 오픈소스 [이음오피스](https://github.com/pblsketch/openoffice)
0.12.5를 고쳐 만든 프로그램이고, 이음오피스는
[GenOffice](https://github.com/genspark-ai/genoffice)를 바탕으로 합니다. 두
프로젝트와 제휴하거나 후원을 받은 관계는 아닙니다([라이선스와 출처](#라이선스와-출처)).

## 차례

- [내려받기](#내려받기)
- [지금 되는 것](#지금-되는-것)
- [구독 연결하기](#구독-연결하기)
- [구독 없이 무료로 쓰기](#구독-없이-무료로-쓰기)
- [앱이 로그인 정보로 하지 않는 일](#앱이-로그인-정보로-하지-않는-일)
- [직접 빌드하기](#직접-빌드하기)
- [알려진 한계](#알려진-한계)
- [개인정보](#개인정보)
- [기여와 문제 신고](#기여와-문제-신고)
- [라이선스와 출처](#라이선스와-출처)

## 내려받기

[Releases](https://github.com/ARTHONG1/ttokttak-studio/releases/latest)에서 내 PC에 맞는
파일을 받습니다. 설치한 앱은 새 버전이 나오면 스스로 업데이트합니다.

| 운영체제                     | 파일                                 |
| ---------------------------- | ------------------------------------ |
| Windows (64비트)             | `HangulAIWorkbench-Setup-<버전>.exe` |
| Mac (Apple Silicon: M1 이후) | `HangulAIWorkbench-<버전>-arm64.dmg` |
| Mac (Intel)                  | `HangulAIWorkbench-<버전>-x64.dmg`   |

설치 파일에는 아직 서명이 없습니다. Windows에서 "Windows의 PC 보호" 창이 뜨면
"추가 정보" → "실행"을 누릅니다. Mac에서 처음 열 때 경고가 뜨면 Finder에서 앱을
Control 키를 누른 채 클릭하고 "열기"를 고릅니다.

설치 없이 써 보려면 [웹 체험판](https://hangul-ai-workbench-545101783843.asia-northeast3.run.app)을
엽니다. 체험판은 문서를 잠시만 보관하므로 저장한 뒤 내려받아 두세요.

## 지금 되는 것

- **탭으로 묶인 편집기**: 한글(`.hwp`, `.hwpx`), 워드(`.docx`), 엑셀(`.xlsx`),
  파워포인트(`.pptx`), PDF, 마크다운, HTML, 마인드맵(`.xmind`). 파일은 내 PC에서
  원래 형식으로 열고 저장합니다.
- **한글 문서 저장**: HWP 문서는 기본으로 HWPX로 저장하고, 원본을 덮어쓰기 전에
  저장본을 다시 읽어 검사합니다. 한컴 한글이 손상 파일로 거부하던 줄 정보·접두사
  문제를 저장할 때 바로잡습니다. 모든 문서가 한컴 한글에서 똑같이 보인다고
  보장하지는 않습니다.
- **편집기마다 있는 AI 창.** 문서를 읽고, 고치고, 바뀐 곳을 표시합니다.
- **홈 화면**: 내 문서를 끌어다 놓거나 골라서 열고, 8가지 새 문서를 만듭니다.
- **특화 기능 → 품의서 생성**: 쇼핑몰 장바구니 내용이나 이미지·한글·PDF·엑셀
  파일을 넣으면 AI가 품의 목록과 품의 기안문을 만듭니다. 목록을 고치면 기안문의
  품목과 금액도 따라 바뀌고, 본문 복사와 CSV 저장을 할 수 있습니다.
- **터미널 명령어와 MCP 서버**(`ieumoffice`, `ieumoffice mcp`): 코딩 에이전트가
  같은 파일을 읽고 만들고 고칠 수 있습니다.
- **화면 언어 21개.** 한국어와 영어 말고는 기계 번역입니다.

## 구독 연결하기

필요한 것은 두 가지입니다.

1. 본인의 Claude 구독 또는 ChatGPT 구독
2. PC에 설치되어 있고 로그인된 **Claude Code** 또는 **Codex**

첫 실행 안내 화면과 **설정 → AI → 구독 연결**에 프로그램별 상태가 보입니다.
로그인은 그 프로그램의 명령(`claude auth login`, `codex login`)과 그 회사의
화면에서 끝납니다. **사용할 AI**를 "자동"으로 두면 Claude가 연결되어 있을 때
Claude를, 아니면 Codex를 씁니다.

구독을 다른 앱에서 써도 되는지, 어디까지 되는지는 사용자와 Anthropic 또는
OpenAI 사이의 약관이 정하고, 그 약관은 바뀔 수 있습니다. 이 앱은 사용자 PC의 공식
프로그램을 실행할 뿐이고, 한 사람의 구독을 다른 사람에게 나눠 주지 않습니다.

## 구독 없이 무료로 쓰기

**설정 → AI → 무료로 쓰기**에서 OpenRouter 또는 Google Gemini를 연결할 수
있습니다. 무료 AI는 구독 모델보다 약하고 하루 사용량에 한도가 있습니다. 무료로
쓰는 동안 보낸 내용은 그 회사의 AI 개선에 쓰일 수 있으니, 개인정보가 담긴 문서는
주의하세요.

## 앱이 로그인 정보로 하지 않는 일

- Claude나 Codex의 로그인 정보를 읽지도, 복사하지도, 저장하지도 않습니다.
- 앱 안에 Claude나 ChatGPT 로그인 화면을 만들지 않습니다.
- 두 회사의 프로그램을 고치지 않고, 배포된 그대로 실행합니다.
- 다른 사람의 AI 사용료를 대신 내거나, 되팔거나, 중간에서 전달하지 않습니다.
- 사용자가 시키지 않은 AI 요청을 뒤에서 시작하지 않습니다.

## 직접 빌드하기

Node 22.12 이상(npm 10 이상)과 Rust가 필요합니다. `cargo`가 PATH에 있어야
합니다(엑셀 처리 프로그램을 만드는 데 씁니다).

```bash
git clone https://github.com/ARTHONG1/ttokttak-studio.git
cd ttokttak-studio
npm install
npm run dev      # 모든 편집기와 앱 창을 개발 모드로 실행
npm run shell    # 또는: 전체를 빌드한 뒤 앱 실행
```

Mac 설치 파일은 `npm run build:all` 뒤
`npm run dist:mac -w @genoffice/shell -- --publish never`로 만듭니다. 결과는
`apps/shell/release`에 생깁니다. 아직 공개한 설치 파일은 없습니다.

웹 체험판(`web/`)은 같은 데스크톱 화면을 브라우저에서 띄우고, AI는 Vertex AI의
Gemini를 씁니다. 로컬에서 띄우려면 `GOOGLE_CLOUD_PROJECT=<프로젝트>
node web/scripts/local-preview.mjs`를 실행합니다.

코드 안의 패키지 이름과 환경 변수에는 `genoffice` / `GENOFFICE_`가, 터미널
명령어에는 `ieumoffice`가 남아 있습니다. 원본 프로젝트의 개선을 계속 받아오기
쉽게 하려고 둔 것입니다. 변경할 때 통과해야 하는 검사는
[CONTRIBUTING.md](CONTRIBUTING.md)(영어)에 있습니다.

## 알려진 한계

- **개발과 확인은 macOS(Apple Silicon)에서 했습니다.** Windows와 Linux 빌드는
  원본 프로젝트의 설정을 그대로 두었고, 이 저장소에서는 확인하지 않았습니다.
- **설치 파일에 서명이 없습니다.** 처음 열 때 운영체제가 경고합니다. 자동
  업데이트도 아직 동작하지 않습니다.
- **한컴 한글과의 호환은 시험한 문서에서만 확인했습니다.** 중요한 문서는 다른
  이름으로 저장해 원본을 남겨 두세요.
- **구독은 API 키보다 답이 조금 늦게 시작됩니다.** 요청마다 그 회사의 프로그램을
  먼저 띄우기 때문입니다.
- **번역.** 화면 언어 21개 가운데 19개는 기계 번역입니다.

## 개인정보

똑딱작업실 데스크톱 앱에는 자체 서버가 없고, 사용 통계도 보내지 않습니다. 문서는
내 PC에 남습니다. AI를 쓰면 문서 내용과 대화가 사용자 본인 계정으로 Anthropic
또는 OpenAI에 전송됩니다(API 키나 무료 AI를 연결했다면 그 회사로). 검색어는
기본적으로 Parallel과 DuckDuckGo로 갑니다. 웹 체험판은 문서와 대화를 Google
Vertex AI로 보냅니다. 전체 목록은 [PRIVACY.md](PRIVACY.md)(영어)에 있습니다.

## 기여와 문제 신고

- 버그, 제안, 상표·저작권 문의와 권리 침해 신고:
  [GitHub Issues](https://github.com/ARTHONG1/ttokttak-studio/issues)
- 보안 문제: 공개 이슈로 올리지 말고 [SECURITY.md](SECURITY.md)에 적힌 대로
  비공개로 알려 주세요.
- 코드 기여: [CONTRIBUTING.md](CONTRIBUTING.md)와
  [행동 강령](CODE_OF_CONDUCT.md)을 읽어 주세요.

## 라이선스와 출처

똑딱작업실은 [Apache License 2.0](LICENSE)으로 배포합니다.

**똑딱작업실은 [이음오피스](https://github.com/pblsketch/openoffice) 0.12.5(커밋
`4e4e9cc`)를 고쳐 만들었고, 이음오피스는
[GenOffice](https://github.com/genspark-ai/genoffice)를 바탕으로 합니다.**
GenOffice는 Genspark(Mainfunc, Inc.)가 만든 오픈소스 오피스 프로그램이고, 두
프로젝트 모두 Apache-2.0 라이선스입니다. 원래의 저작권 고지는 그대로 두었고,
출처와 바꾼 내용은 [NOTICE](NOTICE)에 적어 두었습니다. 이음오피스에 기여한 분들은
[CONTRIBUTORS.md](CONTRIBUTORS.md)에 있습니다.

슬라이드 디자인 템플릿은
[frontend-slides](https://github.com/zarazhangrui/frontend-slides)(MIT
라이선스)의 디자인을 바탕으로 다시 만들었고, 템플릿 글꼴은 모두 SIL Open Font
License 1.1입니다. 고지와 글꼴 목록은 [NOTICE](NOTICE)에 있습니다.

한글(HWP·HWPX) 편집기는 [rhwp](https://github.com/edwardkim/rhwp)(MIT
라이선스)를 바탕으로 합니다. 한글과컴퓨터가 HWP 형식 문서를 공개하며 붙인
조건에 따라 다음 문구를 밝힙니다.

> 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여
> 개발하였습니다.

똑딱작업실은 독립된 프로젝트입니다. 이음오피스 개발자, Genspark / Mainfunc, Inc.,
Anthropic, OpenAI, Microsoft, 한글과컴퓨터, Adobe, XMind, Google과 제휴하거나
후원·보증을 받은 관계가 아닙니다. "이음오피스"·"IeumOffice", "GenOffice"와
"Genspark"라는 이름과 로고는 각 소유자의 것이고, "Claude", "Codex", "ChatGPT"도
그렇습니다. "Microsoft", "Windows", "Word", "Excel", "PowerPoint"는 Microsoft
Corporation의 상표이고, "한글", "한컴", "HWP", "HWPX"는 주식회사
한글과컴퓨터의 등록 상표이며, "XMind"는 XMind Ltd.의, "Google 드라이브"는
Google LLC의 상표입니다. 여기서는 이 프로그램이 무엇을 바탕으로 만들어졌고,
무엇과 함께 동작하며, 어떤 파일을 여는지 알리기 위해서만 그 이름을 적었습니다.

### 다시 배포할 때

Apache License 2.0은 누구나 고쳐서 다시 배포하는 것을 허락합니다. 다시 배포할
때는 [LICENSE](LICENSE)와 [NOTICE](NOTICE)를 함께 넣고, 고친 파일에는 고쳤다는
사실을 밝혀야 합니다. 이 라이선스는 상표를 쓸 권리를 주지 않습니다(4조, 6조).
바탕이 된 프로젝트들도 각자의 라이선스 조건을 지켜야 합니다. 목록은
[NOTICE](NOTICE)와 설치 폴더의 `THIRD-PARTY-NOTICES.txt`에 있습니다.

### 보증하지 않음

똑딱작업실은 Apache License 2.0의 7조, 8조에 따라 있는 그대로 제공하며, 어떤
보증도 하지 않습니다. AI가 만든 내용은 틀릴 수 있으니 확인한 뒤 쓰세요.
