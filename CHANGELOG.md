# 똑딱작업실 업데이트 기록

각 버전의 주요 변경점입니다. 자세한 내용과 설치 파일은 [GitHub Releases](https://github.com/ARTHONG1/ttokttak-workspace/releases)에 있습니다. 이 목록과 저장소 첫 화면의 최신 버전은 릴리스를 게시하거나 수정하면 GitHub Actions가 갱신합니다.

<!-- GITHUB-RELEASES:START -->

### [v0.16.8](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.16.8) · 2026-11-09

똑딱작업실 0.16.8은 설치본에 들어 있는 내장 AI를 3차 '똑딱AI' 모델로 바꾼 업데이트입니다. Apple Silicon Mac과 Windows(64비트) 설치본에 적용되며, 웹 체험판과 Intel Mac 설치본은 바뀌지 않습니다.

### [v0.16.7](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.16.7) · 2026-11-09

똑딱작업실 0.16.7은 문서 변환에서 어떤 문서든 모든 형식으로 바꿀 수 있게 한 업데이트입니다. 한 번에 바꿀 엔진이 없으면 PDF나 워드를 거쳐 갑니다. 예를 들어 한글 → PDF → PowerPoint, 엑셀 → PDF → 워드 → 한글처럼 바꿉니다.

### [v0.16.6](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.16.6) · 2026-11-09

똑딱작업실 0.16.6는 한글 문서를 읽고 편집하는 엔진(rhwp)을 공식 0.9.0으로 올린 업데이트입니다. 별도 fork 없이 공식 버전을 그대로 쓰고, 공식 버전에 아직 없는 보정 7개만 얹었습니다. 긴 문서의 입력 속도와 Shift+화살표 표 칸 크기 조절은 이전과 같이 동작합니다.

### [v0.16.4](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.16.4) · 2026-11-08

똑딱작업실 0.16.4는 내장 AI 모델을 문서 편집용으로 추가 학습한 버전으로 바꾸고, Windows 설치본에도 내장 AI를 탑재한 업데이트입니다. Apple Silicon Mac과 Windows(64비트) 설치본에 앱의 실제 편집 도구 호출 기록으로 한 번 더 학습한 모델이 들어가며, 크기·메모리·속도는 이전과 같습니다.

### [v0.16.3](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.16.3) · 2026-11-07

똑딱작업실 0.16.3은 바탕이 된 다른 프로젝트의 이름을 앱과 저장소에서 모두 걷어 낸 버전입니다. 앱 화면, 터미널 명령어, AI 에이전트 연결, 설치 안내, 도움말에 똑딱작업실의 이름만 남았고, 기존 설정은 처음 실행할 때 자동으로 옮겨집니다.

### [v0.16.2](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.16.2) · 2026-11-07

똑딱작업실 0.16.2는 Apple Silicon Mac용 설치 파일에 AI 모델을 넣은 첫 버전입니다. 문서와 대화가 PC 밖으로 나가지 않고(보안), 구독료나 사용량 요금 없이(비용) 한글·워드 문서 수정과 초안 작성을 AI에게 맡길 수 있습니다. 앱 아이콘도 ACE 연구회 토끼로 바꿨습니다.

### [v0.16.1](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.16.1) · 2026-11-06

문서 변환에 PDF → 한글(HWP·HWPX) 이 들어왔습니다.

### [v0.16.0](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.16.0) · 2026-11-06

똑딱업무에 문서 변환이 들어왔습니다. 문서를 올리고 원하는 형식을 고르면 바로 내려받습니다.

### [v0.15.10](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.15.10) · 2026-11-05

똑딱서명을 처음 쓰는 분이 바로 따라 할 수 있게 소개 영상을 붙였습니다.

### [v0.15.9](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.15.9) · 2026-11-05

한글 문서의 표 칸에 AI가 여러 줄을 넣을 때 양식이 망가지던 문제를 고쳤습니다.

### [v0.15.8](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.15.8) · 2026-11-05

똑딱서명에서 서명을 직접 그릴 수 있게 되었습니다. 웹 체험판은 로그인 없이 바로 쓸 수 있습니다.

### [v0.15.7](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.15.7) · 2026-11-04

서명 그림을 문서에 넣는 일을 한 화면에서 끝내는 똑딱서명이 똑딱업무에 들어왔습니다.

### [v0.15.6](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.15.6) · 2026-11-04

K-에듀파인 품의 보내기에 쓰는 크롬 확장의 이름이 「똑딱작업실」로 바뀌고, 앞으로 다른 학교 업무도 담을 수 있게 바뀌었습니다. 지금 들어 있는 업무는 [에듀파인 품의] 하나이고, 쓰는 방법은 그대로입니다.

### [v0.15.5](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.15.5) · 2026-11-04

이번 버전부터 Windows와 Mac 모두 앱 안에서 업데이트할 수 있습니다. 0.15.5만 한 번 직접 설치하면, 그다음 버전부터는 설정 화면에서 버튼으로 업데이트하면 됩니다.

### [v0.15.4](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.15.4) · 2026-11-04

이번 버전부터 Windows와 Mac 모두 앱 안에서 업데이트할 수 있습니다. 0.15.4만 한 번 직접 설치하면, 그다음 버전부터는 설정 화면에서 버튼으로 업데이트하면 됩니다.

### [v0.15.3](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.15.3) · 2026-11-03

이번 버전부터 Windows와 Mac 모두 앱 안에서 업데이트할 수 있습니다. 0.15.3만 한 번 직접 설치하면, 그다음 버전부터는 설정 화면에서 버튼으로 업데이트하면 됩니다.

### [v0.14.3](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.14.3) · 2026-11-02

자세한 변경 내역은 릴리스 페이지에서 확인하세요.

### [v0.14.2](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.14.2) · 2026-11-02

Codex를 로컬 중계 프로그램으로 연결해 쓰는 경우에도 그 모델로 AI를 쓸 수 있게 했습니다. 0.14.1의 문서 양식 분석과 ‘서식 고정’도 그대로 들어 있습니다.

### [v0.14.1](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.14.1) · 2026-11-02

한글 문서를 열면 AI가 먼저 양식을 분석해 알려 주고, ‘서식 고정’을 켜면 서식은 그대로 둔 채 내용만 양식에 맞춰 고칩니다.

### [v0.14.0](https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/v0.14.0) · 2026-10-31

AI로 문서 일에서 해방되는 오픈소스 작업실의 첫 공개 릴리스입니다.
<!-- GITHUB-RELEASES:END -->
