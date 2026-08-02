#!/usr/bin/env bash
# 디버그 APK 원커맨드 빌드 (PLAN.md 6장 DoD: 문서화된 한 줄 재현).
# 시스템 JDK가 없으면 Android Studio 번들 JDK(JBR 17)로 폴백한다.
set -euo pipefail
cd "$(dirname "$0")/.."

# macOS의 /usr/bin/java는 JDK가 없어도 존재하는 스텁이므로 실제 실행으로 판별한다.
if [ -z "${JAVA_HOME:-}" ] && ! java -version >/dev/null 2>&1; then
  JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  if [ -d "$JBR" ]; then
    export JAVA_HOME="$JBR"
    echo "[android-apk] JAVA_HOME not set — using Android Studio JBR: $JBR"
  else
    echo "[android-apk] ERROR: no JDK found. Install JDK 17 or Android Studio." >&2
    exit 1
  fi
fi

npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
echo "[android-apk] APK: android/app/build/outputs/apk/debug/app-debug.apk"
