# 똑딱생기부

생기부만 하는 독립 데스크톱 프로그램입니다. 교과 세특·행발 초안 쓰기, 유사도 검사와 표현 바꾸기, 명렬표(엑셀·CSV) 불러오기, CSV 저장, 임시 저장, 나이스로 보내기를 합니다. AI는 앱 안에 든 **똑딱AI**(Qwen3.5-2B Q6_K + 생기부 전용 학습분)만 쓰며, 학생 글을 인터넷으로 보내지 않습니다.

똑딱작업실과 같은 저장소에 있지만 코드와 설정을 함께 쓰지 않습니다. 이 폴더만 빌드·시험·패키징하고, 똑딱작업실의 빌드·설치 파일·공개 웹에는 들어가지 않습니다. 이름(`TtokttakSaenggibu`), 앱 id(`kr.ttokttak.saenggibu`), 버전, 설정 폴더도 따로입니다.

## 개발

```sh
npm run build -w @ttokttak/saenggibu
npm run test -w @ttokttak/saenggibu          # 나이스 실제 Chromium 시험 포함
node apps/saenggibu/scripts/prepare-ai.mjs <base-Q6_K.gguf> <llama-b12167 폴더> <school_record adapter.gguf>
npx playwright test -c apps/saenggibu/e2e/playwright.config.ts   # 앱을 띄워 똑딱AI로 행발·세특 1명씩
npm run dist:mac -w @ttokttak/saenggibu       # release/에 설치 파일
```

`prepare-ai.mjs`는 기본 모델과 생기부 학습분의 SHA256이 고정값과 다르면 멈춥니다. 생기부 지시문(`record-core.ts`, `record-similarity.ts`)은 똑딱AI가 학습한 글자 그대로여야 하므로 `tests/prompt-contract.test.ts`가 해시로 지킵니다. 지시문을 바꾸려면 학습분을 다시 재거나 학습해야 합니다.

## 나이스로 보내기

앱이 전용 Chrome(또는 Edge) 창을 열면 그 창에서 업무포털에 로그인하고 나이스 입력 화면의 첫 학생 줄을 고른 뒤 앱에서 다시 누릅니다. 학생 이름이 다르거나 칸에 다른 글이 있으면 멈추고, 나이스 [저장]은 선생님이 직접 누릅니다. 실제 나이스 서버에서는 아직 확인하지 않았습니다.
