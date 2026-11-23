# 똑딱생기부

생기부만 하는 독립 데스크톱 프로그램입니다. 교과 세특·행발·창체 초안 쓰기, 유사도 검사와 표현 바꾸기, 명렬표(엑셀·CSV) 불러오기, 나이스에서 학급 명단·누가기록 가져오기, CSV 저장, 임시 저장, 나이스로 보내기를 합니다. AI는 이 컴퓨터 안에서 도는 **똑딱AI**만 쓰며, 학생 글을 인터넷으로 보내지 않습니다. 똑딱AI는 똑딱작업실과 같은 모델입니다(0.3.0부터): 공용 기본 모델(Qwen3.5-2B Q8_0)에 똑딱AI의 생기부 어댑터를 켜서 씁니다. 똑딱작업실도 같은 두 파일에 문서·품의 어댑터를 더해 씁니다.

배포: https://github.com/ARTHONG1/ttokttak-saenggibu (Apple Silicon Mac, Windows 64비트). 똑딱작업실과 같은 저장소에 있지만 코드와 설정을 함께 쓰지 않습니다. 이 폴더만 빌드·시험·패키징하고, 똑딱작업실의 빌드·설치 파일·공개 웹에는 들어가지 않습니다. 이름(`TtokttakSaenggibu`), 앱 id(`kr.ttokttak.saenggibu`), 버전, 설정 폴더도 따로입니다.

## 모델은 처음 켤 때 한 번 받습니다

모델 파일 두 개(기본 모델 2,012,012,800바이트, 생기부 어댑터 149,294,368바이트, 합계 약 2.16GB)는 설치 파일에 넣지 않습니다. Windows 설치 파일이 2GB를 넘지 못해서입니다. 앱을 처음 켜면 똑딱작업실과 함께 쓰는 [모델 릴리스](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/model-20261120-2)에서 사용자 폴더(`<userData>/ai/base.gguf`, `<userData>/ai/adapters/school_record.gguf`)로 받고(`src/main/model-store.ts`), `src/shared/model.ts`에 고정한 크기와 SHA256이 맞을 때만 씁니다. 끊기면 받던 곳부터 이어 받고(HTTP Range), 연결이 끊기면 세 번까지 저절로 다시 시도한 뒤 [다시 받기]를 보입니다. GitHub가 막힌 곳에서는 다른 곳에서 받은 두 파일을 [파일로 넣기]로 함께 고릅니다. 한 번 확인한 파일은 옆에 확인 기록을 남겨, 다음 실행부터는 다시 계산하지 않습니다. 받는 동안에도 명렬표·관찰 기록 입력은 되고 AI 쓰기만 기다립니다.

0.2.x에서 올라오면 옛 모델(`ai/model.gguf`, 똑딱AI 생기부 V7 B 한 파일)은 새 두 파일을 다 받고 확인한 뒤에만 지웁니다. 생기부 어댑터는 V7 B의 학습 결과를 어댑터로 옮긴 것이라 답이 V7 B와 완전히 같다고 보장하지는 않습니다(모델 프로젝트의 비교에서 80건 중 59건이 같았습니다).

서버(llama.cpp)는 앱에 들어 있고, 모델 폴더에서 실행해 모델과 어댑터를 그 폴더 안의 경로로만 넘깁니다. 사용자 폴더 경로에 한글이 있어도 실행 인자에 들어가지 않게 하기 위해서입니다.

## 쓰기

한 목록에는 학생 50명까지 넣습니다. [전체 생성]은 목록 순서대로 한 명씩 씁니다(`GENERATE_AT_ONCE`, 이 Mac에서 한 명에 약 3초, 40명 반이면 약 2분). 관찰 기록이 똑딱AI 입력 한도를 넘는 학생과 답이 끝나지 않은 학생은 건너뛰고 나머지를 쓴 뒤 이름을 알립니다. AI 자체가 답하지 않으면 두 명째에서 멈춥니다.

똑딱AI 짧은 형식(준비, 꺼 둠): 모든 생기부 요청은 긴 지시문 형식과 함께 똑딱AI의 짧은 형식(지시문 없이 일의 종류와 항목만, `record-core.ts`의 `compactRequest`, 작업공간 `docs/똑딱AI-생기부-짧은-입력-규칙.md`)으로도 만들어집니다. 본체는 `src/shared/model.ts`의 `RECORD_FORMAT`이 `compact`일 때만 짧은 형식을 온도 0으로 보냅니다. 지금 어댑터는 긴 지시문으로 학습해 `instructions`이고, 짧은 형식을 배운 어댑터를 고정할 때 같은 커밋에서 바꿉니다(`tests/local-ai.test.ts`가 어댑터 SHA256과 함께 확인). 개발 실행에서는 `SAENGGIBU_RECORD_FORMAT=compact`로 미리 시험할 수 있고 설치판은 무시합니다. 짧은 형식에서는 학생마다 변형 1~4를 차례로 붙이고 [다시 생성]이 다음 변형으로 묻습니다.

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

[나이스로 보내기]를 한 번 누릅니다. 전용 Chrome 또는 Edge 창에서 업무포털에 로그인하고 해당 업무의 나이스 입력 화면을 연 뒤, 입력을 시작할 학생 줄 하나를 고르면 전송이 이어집니다. 앱에서 진행 단계를 확인하거나 [전송 취소]를 누를 수 있습니다. 대기 시간이 10분을 넘거나 전송용 창을 닫으면 요청이 끝납니다.

앱은 학생 이름을 확인하고 입력값을 나이스 표에서 다시 읽습니다. 이름이 다르거나 칸에 다른 글이 있으면 멈춥니다. 일부만 입력됐다면 확인된 인원과 이어서 시작할 학생을 안내합니다. 나이스 [저장]은 선생님이 직접 누릅니다. 실제 나이스 서버에서는 아직 확인하지 않았습니다.

## 나이스에서 가져오기

학생 칸의 [나이스에서 가져오기]는 [나이스로 보내기]와 같은 전용 브라우저 창을 씁니다. 선생님이 그 창에서 로그인하고 **학급담임 → 행동특성및종합의견 → 누가기록** 화면을 연 뒤 [나이스 화면에서 읽기]를 누르면, 앱이 열린 나이스 화면의 데이터에서 학급 명단(반·번호·이름)과 누가기록(날짜·내용)을 읽어 미리 보여 줍니다(`src/shared/neis-class.ts`의 `readClassInPage`, `src/main/neis-driver.ts`의 `readClass`). 나이스에서는 아무것도 누르거나 쓰거나 저장하지 않고, 읽은 내용은 이 컴퓨터에만 둡니다.

[학생 목록에 넣기]를 누르면 나이스 순서대로 넣습니다(`record-neis.ts`). 이미 목록에 있는 학생은 이름으로 찾아 쓴 내용을 그대로 두고, 나이스에 없는 학생은 맨 뒤에 남깁니다. 행발에서는 누가기록을 학생마다 관찰 기록에 덧붙일 수 있고, 이미 관찰 기록에 들어 있는 기록은 다시 넣지 않습니다. 넣기 전에 미리보기에서 결과(그대로 둘 학생, 새 학생, 맨 뒤로 갈 학생, 같은 이름 학생, 1,200자를 넘을 관찰 기록)를 보여 주고, 합쳐서 50명을 넘으면 넣지 않습니다(저장할 때 뒷부분이 빠지기 때문).

읽을 화면이 분명하지 않으면 고르지 않고 멈춥니다. 서로 다른 반의 명단이 있는 화면이 함께 열려 있거나 한 명단에 여러 반이 섞여 있으면, 누가기록 화면 하나만 남기라고 알립니다. 누가기록에 학생 번호가 없으면 명단에서 선택한 학생의 기록으로 보고, 그때는 "선택한 학생의 누가기록만 읽혔다"고 알립니다. 어느 학생 것인지 알 수 없는 기록과 다른 반 기록은 넣지 않고 건수를 알립니다.

읽는 데이터 이름(실행 중인 화면 목록 `cpr.core.Platform.INSTANCE.getAllRunningAppInstances()`, 명단 `dsStu`의 `clsNo`·`stuInvlNo`·`stuFlnm`, 누가기록 `dsGicRecStu`의 `ghvrDevEnfcYmd`·`ghvrDevCn`)은 **실제 나이스에서 아직 확인하지 않았습니다**. 시험은 직접 만든 가짜 화면 데이터(`tests/fixtures/fake-neis-data.ts`)와 실제 Chrome으로 했습니다(`tests/neis-class.test.ts`, `tests/neis-browser.test.ts`, `e2e/app.spec.ts`). 실제 나이스에서 명단을 찾지 못하면 화면 안내 문구가 그대로 뜨고, 그때 데이터 이름을 실제 화면에 맞춰 고칩니다.
