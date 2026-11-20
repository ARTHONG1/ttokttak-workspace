---
name: release-ttokttak
description: 똑딱작업실·똑딱생기부의 새 버전, 똑딱AI 모델 릴리스, 공개 웹 배포를 맡을 때 읽는다(버전 올리기, 설치 파일, GitHub 릴리스와 업데이트 목록 파일, 베타 예행, 릴리스 본문). Use when cutting a release, shipping a version, publishing installers or model files, deploying the web edition, or writing release notes.
---

# 릴리스 작업

## 정본은 docs/releasing.ko.md 하나다

- `docs/releasing.ko.md`를 처음부터 끝까지 읽고 그 순서대로 한다. 명령, 파일 이름, 확인 항목, 승인 범위는 모두 그 문서가 정한다.
- 이 스킬은 문서를 가리키기만 한다. 문서와 실제 절차가 다르면 일을 멈추지 말고 문서를 고친 뒤 같은 커밋이나 바로 다음 커밋에 넣는다.

## 에이전트가 특히 지킬 것

- **승인 범위**: 사용자가 배포·릴리스를 요청했으면 공개, 웹 배포, 이 Mac 설치까지 진행한다. 다시 묻는 것은 문서 9의 경우뿐이다.
- **시간**: 기다리는 일(CI, Actions 빌드, Cloud Build, 이 Mac 패키징)은 버전 커밋 직후 동시에 시작한다. 기다리는 동안 다음 단계 준비를 한다.
- **릴리스 중 push 금지**: 릴리스 커밋의 CI가 끝날 때까지 `main`에 다른 커밋을 올리지 않는다.
- **실제 경로로 확인**: 설치본(`npm run install:app`)과 실제 GitHub 주소로 확인한다. 빌드 폴더의 앱을 켜지 않는다.
- **끝은 `npm run status`**: 작업공간 루트에서 "고칠 것 없음"이 나와야 끝이다. 보고에 그 결과를 한두 줄 넣는다.
- 보호 장치(release-guard, Codex 훅)가 막으면 우회하지 않고 원인을 고친다.
