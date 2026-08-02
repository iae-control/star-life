# 별의 일생 (star-life)

세로형 슈팅 게임 — v4 데모를 프로덕션으로 끌어올리는 프로젝트. 전체 계획은 [PLAN.md](PLAN.md) 참고.

**플레이(웹)**: https://iae-control.github.io/star-life/ — main 푸시 시 GitHub Actions가 자동 배포. 아이폰은 Safari에서 열고 "홈 화면에 추가"하면 앱처럼 실행됩니다.

## 요구 환경

- Node LTS(20+), npm
- Android 빌드: Android SDK 34+ (Android Studio), JDK 17
  - 시스템 JDK가 없으면 Android Studio 번들 JDK 사용:
    `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`

## 명령

| 명령                              | 설명                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm install`                     | 의존성 설치                                                                                   |
| `npm run dev`                     | 개발 서버 (LAN 노출 — 폰에서 접속 가능)                                                       |
| `npm run build`                   | 타입체크 + 웹 프로덕션 빌드 (`dist/`)                                                         |
| `npm run preview`                 | 빌드 결과 로컬 서빙                                                                           |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                                             |
| `npm test`                        | vitest (순수 로직만)                                                                          |
| `npm run android:apk`             | 웹 빌드 → Capacitor 동기화 → 디버그 APK (`android/app/build/outputs/apk/debug/app-debug.apk`) |

## 폰에 디버그 APK 설치

```
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

또는 `app-debug.apk` 파일을 폰에 옮겨 직접 설치(출처 불명 앱 허용 필요).

## 구조

PLAN.md 9장 참조. `src/data/`의 JSON이 콘텐츠의 단일 출처(M2부터), `legacy/`는 v4 데모 레퍼런스.
