#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "[INFO] node_modules 없음 — npm install 실행 중..."
  npm install
fi

OS="$(uname -s)"
case "$OS" in
  Darwin)
    echo "[INFO] macOS DMG 빌드 중..."
    npm run dist:mac
    echo ""
    echo "[완료] dist/ 폴더에서 .dmg 파일을 확인하세요."
    open dist
    ;;
  Linux)
    echo "[INFO] Linux AppImage/deb 빌드 중..."
    npm run dist:linux
    echo ""
    echo "[완료] dist/ 폴더에서 빌드 결과물을 확인하세요."
    ;;
  *)
    echo "[ERROR] 지원하지 않는 플랫폼: $OS"
    echo "Windows는 package.bat을 사용하세요."
    exit 1
    ;;
esac
