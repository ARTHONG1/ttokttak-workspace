# 똑딱생기부

생기부만 하는 독립 데스크톱 프로그램입니다. 교과 세특·행발·창체 초안 쓰기, 유사도 검사와 표현 바꾸기, 명렬표(엑셀·CSV) 불러오기, CSV 저장, 임시 저장, 나이스로 보내기를 합니다. AI는 이 컴퓨터 안에서 도는 **똑딱AI**만 쓰며, 학생 글을 인터넷으로 보내지 않습니다. 똑딱AI는 똑딱작업실과 같은 모델입니다(0.3.0부터): 공용 기본 모델(Qwen3.5-2B Q8_0)에 똑딱AI의 생기부 어댑터를 켜서 씁니다. 똑딱작업실도 같은 두 파일에 문서·품의 어댑터를 더해 씁니다.

배포: https://github.com/ARTHONG1/ttokttak-saenggibu (Apple Silicon Mac, Windows 64비트). 똑딱작업실과 같은 저장소에 있지만 코드와 설정을 함께 쓰지 않습니다. 이 폴더만 빌드·시험·패키징하고, 똑딱작업실의 빌드·설치 파일·공개 웹에는 들어가지 않습니다. 이름(`TtokttakSaenggibu`), 앱 id(`kr.ttokttak.saenggibu`), 버전, 설정 폴더도 따로입니다.

## 모델은 처음 켤 때 한 번 받습니다

모델 파일 두 개(기본 모델 2,012,012,800바이트, 생기부 어댑터 149,294,368바이트, 합계 약 2.16GB)는 설치 파일에 넣지 않습니다. Windows 설치 파일이 2GB를 넘지 못해서입니다. 앱을 처음 켜면 똑딱작업실과 함께 쓰는 [모델 릴리스](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/model-20261120-2)에서 사용자 폴더(`<userData>/ai/base.gguf`, `<userData>/ai/adapters/school_record.gguf`)로 받고(`src/main/model-store.ts`), `src/shared/model.ts`에 고정한 크기와 SHA256이 맞을 때만 씁니다. 끊기면 받던 곳부터 이어 받고(HTTP Range), 연결이 끊기면 세 번까지 저절로 다시 시도한 뒤 [다시 받기]를 보입니다. GitHub가 막힌 곳에서는 다른 곳에서 받은 두 파일을 [파일로 넣기]로 함께 고릅니다. 한 번 확인한 파일은 옆에 확인 기록을 남겨, 다음 실행부터는 다시 계산하지 않습니다. 받는 동안에도 명렬표·관찰 기록 입력은 되고 AI 쓰기만 기다립니다.

0.2.x에서 올라오면 옛 모델(`ai/model.gguf`, 똑딱AI 생기부 V7 B 한 파일)은 새 두 파일을 다 받고 확인한 뒤에만 지웁니다. 생기부 어댑터는 V7 B의 학습 결과를 어댑터로 옮긴 것이라 답이 V7 B와 완전히 같다고 보장하지는 않습니다(모델 프로젝트의 비교에서 80건 중 59건이 같았습니다).

서버(llama.cpp)는 앱에 들어 있고, 모델 폴더에서 실행해 모델과 어댑터를 그 폴더 안의 경로로만 넘깁니다. 사용자 폴더 경로에 한글이 있어도 실행 인자에 들어가지 않게 하기 위해서입니다.

## 개발

```sh
npm run build -w @ttokttak/saenggibu
npm run test -w @ttokttak/saenggibu          # 모델 받기(로컬 서버), 나이스 실제 Chromium 시험 포함
node apps/saenggibu/scripts/prepare-ai.mjs <llama-b12167 폴더>   # 실행기만 build/local-ai에
npx playwright test -c apps/saenggibu/e2e/playwright.config.ts   # 앱을 띄워 기본 모델+생기부 어댑터로 행발·세특·창체, 받기 화면
npm run dist:mac -w @ttokttak/saenggibu       # release/에 설치 파일 (Windows는 Actions의 "똑딱생기부 Windows build")
SAENGGIBU_PACKAGED_EXE=<설치한 앱의 실행 파일> npx playwright test -c apps/saenggibu/e2e/playwright.config.ts installed.spec.ts
```

개발 실행에서는 `SAENGGIBU_MODEL_FILE`(와 `SAENGGIBU_ADAPTER_FILE`)로 모델 파일을 바로 쓰거나 `SAENGGIBU_MODEL_URL`·`_BYTES`·`_SHA256`로 다른 파일 하나를 받게 할 수 있습니다. 설치판은 이 값을 무시합니다. 패키징은 `build/local-ai`에 모델이 들어 있거나 옛 준비 결과이면 멈춥니다. 생기부 지시문 가운데 똑딱AI가 학습한 세특·행발·창체·표현 바꾸기 지시문은 학습한 글자 그대로여야 하므로 `tests/prompt-contract.test.ts`가 해시로 지킵니다. 지시문을 바꾸려면 모델을 다시 재거나 학습해야 합니다.

## 나이스로 보내기

앱이 전용 Chrome(또는 Edge) 창을 열면 그 창에서 업무포털에 로그인하고 나이스 입력 화면의 첫 학생 줄을 고른 뒤 앱에서 다시 누릅니다. 학생 이름이 다르거나 칸에 다른 글이 있으면 멈추고, 나이스 [저장]은 선생님이 직접 누릅니다. 실제 나이스 서버에서는 아직 확인하지 않았습니다.
